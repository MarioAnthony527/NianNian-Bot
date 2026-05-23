import { z } from "zod";
import { DEFAULT_FOLDER } from "@/lib/constants";
import { config } from "@/lib/config";
import type { AnalyzeResult, ParsedDouyin, ReminderCopy, CommitmentWithVideo } from "@/lib/types";
import { weekdayName } from "@/lib/time";

const rawAnalyzeSchema = z.object({
  is_real_commitment: z.boolean(),
  noise_reason: z.string().default(""),
  folder: z.enum(["美食", "身体", "工作", "知识", "关系", "杂物"]).default(DEFAULT_FOLDER),
  commitment_summary: z.string().default(""),
  executable_steps: z.array(z.string()).default([]),
  estimated_cost: z.string().default("15分钟"),
  best_push_window: z.string().default("随时"),
  tone_hint: z.string().default("实用型"),
});

const copySchema = z.object({
  title: z.string().min(1).max(30),
  body_main: z.string().min(1).max(120),
  body_steps_intro: z.string().min(1).max(20),
  body_steps: z.array(z.string()).min(1).max(5),
});

async function chatJson<T>(input: {
  model: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  temperature?: number;
}) {
  if (!config.llmApiKey) {
    throw new Error("Missing LLM_API_KEY");
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${config.llmApiBase.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.llmApiKey}`,
        },
        body: JSON.stringify({
          model: input.model,
          temperature: input.temperature ?? 0.3,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.user },
          ],
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content ?? "{}";
      return input.schema.parse(JSON.parse(content));
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function analyzeVideo(parsed: ParsedDouyin): Promise<AnalyzeResult> {
  const raw = await chatJson({
    model: config.llmModelAnalyze,
    schema: rawAnalyzeSchema,
    temperature: 0.2,
    system:
      "你是一个理解抖音视频背后用户意图的 AI 分析师。只输出严格 JSON，不要 Markdown。无法判断时倾向娱乐，避免打扰用户。",
    user: `判断这条视频是未来想兑现的承诺，还是刷过就忘的娱乐。

【视频信息】
- 标题: ${parsed.title}
- 描述: ${parsed.description}
- 作者: ${parsed.author || "未知"}
- 标签: ${parsed.tags.join(", ") || "无"}
- 视频内容/分享文案: ${parsed.asrText || parsed.description}

【输出 JSON】
{
  "is_real_commitment": true,
  "noise_reason": "",
  "folder": "美食|身体|工作|知识|关系|杂物",
  "commitment_summary": "≤25字",
  "executable_steps": ["≤15字", "≤15字", "≤15字"],
  "estimated_cost": "5分钟|15分钟|半小时|半天|更长",
  "best_push_window": "饭点前|周末早上|工作日晚上|睡前|通勤时段|随时",
  "tone_hint": "焦虑型|向往型|兴趣型|实用型"
}

承诺标准：包含教程、方法、清单、行动指令、可重复练习。纯搞笑、八卦、审美、明星动态是娱乐。
禁止编造视频中没有的信息。步骤必须具体。`,
  });

  if (!raw.is_real_commitment) {
    return {
      ...raw,
      noise_reason: raw.noise_reason || "更像刷过就好的内容",
      commitment_summary: raw.commitment_summary || "非承诺内容",
      executable_steps: raw.executable_steps.length ? raw.executable_steps : ["无需提醒"],
    };
  }

  return {
    ...raw,
    commitment_summary: raw.commitment_summary || parsed.title || "待整理的承诺",
    executable_steps: raw.executable_steps.length ? raw.executable_steps : ["先看一遍内容", "选一个最小动作", "今天完成一次"],
  };
}

export async function generateReminderCopy(commitment: CommitmentWithVideo): Promise<ReminderCopy> {
  const now = new Date();
  const reminders = commitment.reminders ?? [];
  const pushCount = reminders.filter((item) => item.status !== "pending").length;
  const history = reminders
    .map((item) => item.user_response)
    .filter(Boolean)
    .join(", ");

  return chatJson({
    model: config.llmModelCopy,
    schema: copySchema,
    temperature: 0.45,
    system: "你是用户的 AI 收藏夹守门人「念念」。只输出严格 JSON，不要 Markdown。文案克制、具体、不鸡汤。",
    user: `今天要为这条承诺推送一条温柔提醒。

【承诺信息】
- 用户想做: ${commitment.commitment_summary}
- 文件夹: ${commitment.folder}
- 情绪基调: ${commitment.tone_hint}
- 可执行步骤: ${commitment.executable_steps.join(" / ")}
- 预计花费: ${commitment.estimated_cost}

【收藏背景】
- 收藏于: ${commitment.created_at}
- 历史响应: ${history || "无"}
- 已经推送过几次: ${pushCount}

【当下情境】
- 今天: ${now.toLocaleDateString("zh-CN")} (${weekdayName(now)}) ${now.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}

【输出 JSON】
{
  "title": "≤14字的钩子标题",
  "body_main": "≤60字主文案",
  "body_steps_intro": "≤8字",
  "body_steps": ["≤15字", "≤15字", "≤15字"]
}

禁用："加油"、"你可以的"、"相信自己"、"亲"、"宝"、"小可爱"、"哦~"、"呢~"、"啦~"。emoji 不超过 2 个。`,
  });
}
