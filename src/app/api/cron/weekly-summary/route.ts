import { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { listUsersWithSavedItems, logEvent } from "@/lib/db";
import { summarizeUserSavedItems } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: NextRequest) {
  if (!config.cronSecret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  return header === `Bearer ${config.cronSecret}` || querySecret === config.cronSecret;
}

async function handleWeeklySummary(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const users = await listUsersWithSavedItems();
  const results = [];

  for (const user of users) {
    const result = await summarizeUserSavedItems(user, {
      mode: "weekly",
      maxSuggestions: 4,
      notifyWhenEmpty: false,
      notifyOnFailure: false,
    });
    results.push({
      user_id: user.id,
      ok: result.ok,
      skipped: result.skipped,
      item_count: result.itemCount,
      suggestion_count: result.suggestionCount,
      remaining_count: result.remainingCount,
      error: result.error,
    });
  }

  await logEvent(null, "weekly_summary_cron_finished", {
    user_count: users.length,
    ok_count: results.filter((item) => item.ok).length,
    failed_count: results.filter((item) => !item.ok).length,
  });

  return Response.json({
    ok: true,
    user_count: users.length,
    results,
  });
}

export async function GET(request: NextRequest) {
  return handleWeeklySummary(request);
}

export async function POST(request: NextRequest) {
  return handleWeeklySummary(request);
}
