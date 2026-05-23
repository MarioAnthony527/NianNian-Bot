import { NextRequest } from "next/server";
import { extractFeishuText } from "@/lib/feishu";
import { handleIncomingFeishuMessage } from "@/lib/workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const processStartedAt = Date.now();

export async function POST(request: NextRequest) {
  const body = await request.json();
  const eventType = body.header?.event_type ?? body.type;
  if (eventType !== "im.message.receive_v1") {
    return Response.json({ ok: true, ignored: eventType ?? "unknown" });
  }

  const event = body.event ?? {};
  const message = event.message ?? {};
  const sender = event.sender ?? {};
  const openId = sender.sender_id?.open_id ?? sender.sender_id?.union_id ?? event.open_id;
  const userId = sender.sender_id?.user_id ?? null;
  const messageId = message.message_id ?? null;
  const messageCreatedAt = Number(message.create_time ?? 0);
  const text = extractFeishuText(message.content);

  if (messageCreatedAt && messageCreatedAt < processStartedAt - 120_000) {
    return Response.json({ ok: true, ignored: "stale_message", messageId });
  }

  if (!openId) {
    return Response.json({ error: "missing open_id" }, { status: 400 });
  }

  await handleIncomingFeishuMessage({ openId, userId, messageId, text });
  return Response.json({ ok: true });
}
