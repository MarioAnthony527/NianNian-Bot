import { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { pushReminderNow } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { commitmentId?: string; secret?: string };
  if (body.secret !== config.demoSecret) {
    return Response.json({ error: "invalid demo secret" }, { status: 401 });
  }
  if (!body.commitmentId) {
    return Response.json({ error: "missing commitmentId" }, { status: 400 });
  }
  const result = await pushReminderNow(body.commitmentId);
  return Response.json({ ok: true, result });
}
