import { NextRequest } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (body.challenge) {
    return Response.json({ challenge: body.challenge });
  }

  const expectedToken = process.env.FEISHU_VERIFICATION_TOKEN;
  if (expectedToken && (body.token ?? body.header?.token) !== expectedToken) {
    return Response.json({ error: "invalid token" }, { status: 401 });
  }

  const value = body.action?.value ?? body.event?.action?.value ?? {};
  const action = value.action;
  const commitmentId = value.commitmentId;

  if (!action || !commitmentId) {
    return Response.json({ error: "missing action or commitmentId" }, { status: 400 });
  }

  fetch(new URL("/api/internal/feishu-card-action", request.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, commitmentId }),
  }).catch((error) => console.error("Internal card action failed", error));

  return Response.json({
    toast: {
      type: "success",
      content: "已收到，正在处理",
    },
  });
}
