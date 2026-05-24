import { config } from "@/lib/config";
import type { ReminderCopy, SummaryResult } from "@/lib/types";

type FeishuTokenCache = {
  token: string;
  expiresAt: number;
};

let tokenCache: FeishuTokenCache | null = null;

async function tenantAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  if (!config.feishuAppId || !config.feishuAppSecret) {
    throw new Error("Missing FEISHU_APP_ID or FEISHU_APP_SECRET");
  }

  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      app_id: config.feishuAppId,
      app_secret: config.feishuAppSecret,
    }),
  });
  const data = (await response.json()) as { code: number; msg: string; tenant_access_token?: string; expire?: number };
  if (data.code !== 0 || !data.tenant_access_token) {
    throw new Error(`Feishu token failed: ${data.msg}`);
  }
  tokenCache = {
    token: data.tenant_access_token,
    expiresAt: Date.now() + (data.expire ?? 3600) * 1000,
  };
  return tokenCache.token;
}

async function feishuFetch(path: string, init: RequestInit) {
  const token = await tenantAccessToken();
  const response = await fetch(`https://open.feishu.cn${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.code !== 0) {
    throw new Error(`Feishu API failed: ${JSON.stringify(data)}`);
  }
  return data;
}

export async function sendFeishuText(openId: string, text: string) {
  return feishuFetch("/open-apis/im/v1/messages?receive_id_type=open_id", {
    method: "POST",
    body: JSON.stringify({
      receive_id: openId,
      msg_type: "text",
      content: JSON.stringify({ text }),
    }),
  });
}

export async function sendFeishuCard(openId: string, card: Record<string, unknown>) {
  return feishuFetch("/open-apis/im/v1/messages?receive_id_type=open_id", {
    method: "POST",
    body: JSON.stringify({
      receive_id: openId,
      msg_type: "interactive",
      content: JSON.stringify(card),
    }),
  });
}

export async function replyFeishuText(messageId: string, text: string) {
  return feishuFetch(`/open-apis/im/v1/messages/${messageId}/reply`, {
    method: "POST",
    body: JSON.stringify({
      msg_type: "text",
      content: JSON.stringify({ text }),
    }),
  });
}

export async function replyFeishuCard(messageId: string, card: Record<string, unknown>) {
  return feishuFetch(`/open-apis/im/v1/messages/${messageId}/reply`, {
    method: "POST",
    body: JSON.stringify({
      msg_type: "interactive",
      content: JSON.stringify(card),
    }),
  });
}

function markdown(text: string) {
  return { tag: "markdown", content: text };
}

export function summaryPushCard(result: SummaryResult, itemCount: number) {
  const suggestionText = result.suggestions
    .map((suggestion, index) => {
      return (
        `**提醒 ${index + 1} / ${result.suggestions.length}：${suggestion.title}**\n` +
        `${suggestion.video_summary}\n\n` +
        `视频链接：${suggestion.video_url ?? "暂无链接"}\n\n` +
        `预计：${suggestion.estimated_cost} · 适合：${suggestion.best_push_window}`
      );
    })
    .join("\n\n---\n\n");

  return {
    config: { wide_screen_mode: true },
    header: {
      template: "turquoise",
      title: { tag: "plain_text", content: "已生成本批提醒" },
    },
    elements: [
      markdown(
        `我整理了当前 ${itemCount} 条收藏，并清空数据列表。\n\n` +
          `${result.summary}\n\n` +
          `${suggestionText}`,
      ),
    ],
  };
}

export function reminderCard(copy: ReminderCopy) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: "turquoise",
      title: { tag: "plain_text", content: copy.title },
    },
    elements: [
      markdown(`${copy.body_main}\n\n${copy.body_steps_intro}：\n${copy.body_steps.map((step, idx) => `${idx + 1}. ${step}`).join("\n")}`),
    ],
  };
}

export function extractFeishuText(content: unknown) {
  if (typeof content !== "string") return "";
  try {
    const parsed = JSON.parse(content) as { text?: string };
    return parsed.text ?? content;
  } catch {
    return content;
  }
}

export function verifyFeishuToken(token: unknown) {
  if (!config.feishuVerificationToken) return true;
  return token === config.feishuVerificationToken;
}
