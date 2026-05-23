import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import lark from "@larksuiteoapi/node-sdk";

function loadLocalEnv() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    const [, key, value] = match;
    if (!process.env[key]) process.env[key] = value;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function normalizeEvent(data) {
  if (data?.event) return data;
  return {
    schema: "2.0",
    header: {
      event_type: data?.header?.event_type ?? data?.type ?? "im.message.receive_v1",
      token: process.env.FEISHU_VERIFICATION_TOKEN,
    },
    event: data,
  };
}

function messageInfo(data) {
  const message = data?.event?.message ?? data?.message ?? {};
  return {
    id: message.message_id ?? null,
    createdAt: Number(message.create_time ?? 0),
  };
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

loadLocalEnv();

const appId = requireEnv("FEISHU_APP_ID");
const appSecret = requireEnv("FEISHU_APP_SECRET");
const appUrl = requireEnv("NEXT_PUBLIC_APP_URL").replace(/\/$/, "");
const forwardUrl = (process.env.FEISHU_WORKER_FORWARD_URL || appUrl).replace(/\/$/, "");
const workerStartedAt = Date.now();
const seenMessageIds = new Set();

const eventDispatcher = new lark.EventDispatcher({}).register({
  "im.message.receive_v1": async (data) => {
    const message = messageInfo(data);
    if (message.createdAt && message.createdAt < workerStartedAt - 120_000) {
      console.log("[feishu-ws] ignored stale message event", message.id ?? "unknown");
      return {};
    }
    if (message.id && seenMessageIds.has(message.id)) {
      console.log("[feishu-ws] ignored duplicate message event", message.id);
      return {};
    }
    if (message.id) seenMessageIds.add(message.id);

    console.log("[feishu-ws] received message event", message.id ?? "unknown");
    postJson(`${forwardUrl}/api/internal/feishu-message`, normalizeEvent(data)).catch((error) => {
      console.error("[feishu-ws] message forward failed", error);
    });
    return {};
  },
  "card.action.trigger": async (data) => {
    const actionValue = data?.event?.action?.value ?? data?.action?.value ?? {};
    const action = actionValue.action;
    const commitmentId = actionValue.commitmentId;
    console.log("[feishu-ws] received card action", action, commitmentId);
    if (action && commitmentId) {
      postJson(`${forwardUrl}/api/internal/feishu-card-action`, { action, commitmentId }).catch((error) => {
        console.error("[feishu-ws] card action forward failed", error);
      });
    }
    return {
      toast: {
        type: "success",
        content: "已收到，正在处理",
      },
    };
  },
});

const client = new lark.WSClient({
  appId,
  appSecret,
  loggerLevel: lark.LoggerLevel.info,
});

console.log(`[feishu-ws] connecting with app ${appId}`);
console.log(`[feishu-ws] public app url ${appUrl}`);
console.log(`[feishu-ws] forwarding events to ${forwardUrl}`);
client.start({ eventDispatcher });
