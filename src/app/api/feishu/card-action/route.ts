import { NextRequest } from "next/server";
import { decryptFeishuPayload } from "@/lib/feishu-crypto";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type CardBody = Record<string, unknown> & {
  challenge?: string;
  encrypt?: string;
  token?: string;
  header?: { token?: string };
  action?: { value?: { action?: string; commitmentId?: string } };
  event?: { action?: { value?: { action?: string; commitmentId?: string } } };
};

export async function GET() {
  return Response.json({
    ok: true,
    route: "feishu/card-action",
    encryptConfigured: Boolean(process.env.FEISHU_ENCRYPT_KEY),
    tokenConfigured: Boolean(process.env.FEISHU_VERIFICATION_TOKEN),
  });
}

export async function POST(request: NextRequest) {
  let body: CardBody;
  try {
    body = (await request.json()) as CardBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const encryptKey = process.env.FEISHU_ENCRYPT_KEY;
  if (body.encrypt && encryptKey) {
    try {
      body = (await decryptFeishuPayload(body.encrypt, encryptKey)) as CardBody;
    } catch (error) {
      console.error("Feishu card decrypt failed", error);
      return Response.json({ error: "decrypt failed" }, { status: 400 });
    }
  }

  if (body.challenge) {
    return Response.json({ challenge: body.challenge });
  }

  const expectedToken = process.env.FEISHU_VERIFICATION_TOKEN;
  const incomingToken = body.token ?? body.header?.token;
  if (expectedToken && incomingToken && incomingToken !== expectedToken) {
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
