import { NextRequest } from "next/server";
import { decryptFeishuPayload } from "@/lib/feishu-crypto";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type FeishuBody = Record<string, unknown> & {
  challenge?: string;
  encrypt?: string;
  token?: string;
  type?: string;
  header?: { token?: string; event_type?: string };
};

export async function GET() {
  return Response.json({
    ok: true,
    route: "feishu/webhook",
    encryptConfigured: Boolean(process.env.FEISHU_ENCRYPT_KEY),
    tokenConfigured: Boolean(process.env.FEISHU_VERIFICATION_TOKEN),
  });
}

export async function POST(request: NextRequest) {
  let body: FeishuBody;
  try {
    body = (await request.json()) as FeishuBody;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }

  const encryptKey = process.env.FEISHU_ENCRYPT_KEY;
  if (body.encrypt && encryptKey) {
    try {
      body = (await decryptFeishuPayload(body.encrypt, encryptKey)) as FeishuBody;
    } catch (error) {
      console.error("Feishu decrypt failed", error);
      return Response.json({ error: "decrypt failed" }, { status: 400 });
    }
  }

  if (body.challenge) {
    const expectedToken = process.env.FEISHU_VERIFICATION_TOKEN;
    if (expectedToken && body.token && body.token !== expectedToken) {
      console.warn("Feishu url_verification token mismatch");
    }
    return Response.json({ challenge: body.challenge });
  }

  const expectedToken = process.env.FEISHU_VERIFICATION_TOKEN;
  const incomingToken = body.token ?? body.header?.token;
  if (expectedToken && incomingToken && incomingToken !== expectedToken) {
    return Response.json({ error: "invalid token" }, { status: 401 });
  }

  fetch(new URL("/api/internal/feishu-message", request.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch((error) => console.error("Internal Feishu forward failed", error));

  return Response.json({ ok: true });
}
