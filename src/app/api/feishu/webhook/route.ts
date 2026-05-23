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

  fetch(new URL("/api/internal/feishu-message", request.url), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch((error) => console.error("Internal Feishu forward failed", error));

  return Response.json({ ok: true });
}
