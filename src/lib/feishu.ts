import { config } from "@/lib/config";
import type { CommitmentWithVideo, ReminderCopy, User } from "@/lib/types";

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

function button(text: string, value: Record<string, string>, type: "default" | "primary" | "danger" = "default") {
  return {
    tag: "button",
    text: { tag: "plain_text", content: text },
    type,
    value,
  };
}

export function processingCard() {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: "blue",
      title: { tag: "plain_text", content: "念念正在看这条视频" },
    },
    elements: [
      markdown("已收到链接。\n\n正在识别视频、理解内容，并判断它是不是一个值得提醒的承诺。"),
    ],
  };
}

export function analysisCard(commitment: CommitmentWithVideo, user: User) {
  const dashboardUrl = `${config.appUrl}/?token=${user.dashboard_token}`;
  return {
    config: { wide_screen_mode: true },
    header: {
      template: "green",
      title: { tag: "plain_text", content: "我看完这条了" },
    },
    elements: [
      markdown(
        `这是关于「${commitment.commitment_summary}」的承诺\n\n` +
          `类型：${commitment.folder} · 估时：${commitment.estimated_cost}\n\n` +
          `我把它放进了「${commitment.folder}」，明早 9 点提醒你。\n\n` +
          `下次可以把 #旅行 放在整条消息开头，或写 文件夹:旅行，直接放进你自己的收藏夹。抖音自带话题不会被当作收藏夹。`,
      ),
      {
        tag: "action",
        actions: [
          button("不放了", { action: "delete", commitmentId: commitment.id }, "danger"),
          button("立刻推送", { action: "push_now", commitmentId: commitment.id }, "primary"),
          {
            tag: "button",
            text: { tag: "plain_text", content: "打开控制台" },
            type: "default",
            url: dashboardUrl,
          },
        ],
      },
    ],
  };
}

export function noiseCard(reason: string) {
  return {
    config: { wide_screen_mode: true },
    header: {
      template: "grey",
      title: { tag: "plain_text", content: "这条我先不放进提醒" },
    },
    elements: [
      markdown(`${reason || "它更像刷过就好的内容。"}\n\n念念只提醒真正能执行的承诺，避免打扰你。`),
    ],
  };
}

export function reminderCard(commitment: CommitmentWithVideo, copy: ReminderCopy, user: User) {
  const dashboardUrl = `${config.appUrl}/commitment/${commitment.id}?token=${user.dashboard_token}`;
  return {
    config: { wide_screen_mode: true },
    header: {
      template: "turquoise",
      title: { tag: "plain_text", content: copy.title },
    },
    elements: [
      markdown(`${copy.body_main}\n\n${copy.body_steps_intro}：\n${copy.body_steps.map((step, idx) => `${idx + 1}. ${step}`).join("\n")}`),
      {
        tag: "action",
        actions: [
          button("做了", { action: "done", commitmentId: commitment.id }, "primary"),
          button("晚点", { action: "snooze", commitmentId: commitment.id }),
          button("算了", { action: "skip", commitmentId: commitment.id }, "danger"),
          {
            tag: "button",
            text: { tag: "plain_text", content: "详情" },
            type: "default",
            url: dashboardUrl,
          },
        ],
      },
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
