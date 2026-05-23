import { NextRequest } from "next/server";
import { handleCardAction } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { action?: string; commitmentId?: string };
  if (!body.action || !body.commitmentId) {
    return Response.json({ error: "missing action or commitmentId" }, { status: 400 });
  }

  const message = await handleCardAction(body.action, body.commitmentId);
  return Response.json({ ok: true, message });
}
