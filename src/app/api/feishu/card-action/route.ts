import { NextRequest } from "next/server";
import { verifyFeishuToken } from "@/lib/feishu";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (body.challenge) {
    return Response.json({ challenge: body.challenge });
  }

  if (!verifyFeishuToken(body.token ?? body.header?.token)) {
    return Response.json({ error: "invalid token" }, { status: 401 });
  }

  const value = body.action?.value ?? body.event?.action?.value ?? {};
  const action = value.action;
  const commitmentId = value.commitmentId;

  if (!action || !commitmentId) {
    return Response.json({ error: "missing action or commitmentId" }, { status: 400 });
  }

  const { handleCardAction } = await import("@/lib/workflow");
  const message = await handleCardAction(action, commitmentId);

  return Response.json({
    toast: {
      type: "success",
      content: message,
    },
  });
}
