import { z } from "zod";
import { DEFAULT_FOLDER } from "@/lib/constants";
import { config } from "@/lib/config";
import type {
  AnalyzeResult,
  CommitmentWithVideo,
  ParsedDouyin,
  ReminderCopy,
  SavedItem,
  SummaryResult,
} from "@/lib/types";
import { weekdayName } from "@/lib/time";

const rawAnalyzeSchema = z.object({
  is_real_commitment: z.boolean().default(true),
  noise_reason: z.string().default(""),
  folder: z.enum(["默认", "美食", "身体", "工作", "知识", "关系", "杂物"]).default(DEFAULT_FOLDER),
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

const summarySchema = z.object({
  summary: z.string().min(1).max(160),
  suggestions: z.array(
    z.object({
      title: z.string().min(1).max(30),
      body: z.string().min(1).max(160),
      steps: z.array(z.string().min(1).max(24)).min(1).max(3),
      estimated_cost: z.string().min(1).max(20),
      best_push_window: z.string().min(1).max(20),
      tone_hint: z.string().min(1).max(20),
    }),
  ).min(1).max(2),
});

function compactText(text: string, fallback: string) {
  const cleaned = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/复制打开抖音|看看|的作品|aan:|jpq:|[A-Za-z]@[A-Za-z]\.[A-Za-z]+|\d{2}\/\d{2}|:\d+[ap]m/gi, "")
    .replace(/[【】#：:，,。.\s]+/g, " ")
    .trim();
  return (cleaned || fallback).slice(0, 28);
}

function fallbackAnalysis(parsed: ParsedDouyin, reason = ""): AnalyzeResult {
  const subject = compactText(parsed.description || parsed.title || parsed.asrText, "回看这条内容");
  return {
    is_real_commitment: true,
    noise_reason: reason,
    folder: DEFAULT_FOLDER,
    commitment_summary: `${subject}，判断是否要做`,
    executable_steps: ["打开原视频回看", "记下一个可做点", "不需要就放下"],
    estimated_cost: "5分钟",
    best_push_window: "随时",
    tone_hint: "兴趣型",
  };
}

function fallbackSummary(items: SavedItem[], reason = ""): SummaryResult {
  return {
    summary: reason || `本批共 ${items.length} 条收藏，适合先压缩成一个低压力回看动作。`,
    suggestions: [
      {
        title: "回看本批收藏",
        body: "花 5 分钟从这些收藏里选一个最想继续的方向，不需要一次做完。",
        steps: ["打开一条最想看的", "记下一个可做点", "决定是否继续"],
        estimated_cost: "5分钟",
        best_push_window: "随时",
        tone_hint: "兴趣型",
      },
    ],
  };
}

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
  try {
    const raw = await chatJson({
      model: config.llmModelAnalyze,
      schema: rawAnalyzeSchema,
      temperature: 0.25,
      system:
        "你是一个把抖音分享内容转成轻量提醒的 AI 分析师。只输出严格 JSON。黑客松 MVP 策略：除非链接完全不可读，否则都要给用户一个低压力、可放下的提醒。",
      user: `把这条抖音分享转成一个可提醒的承诺。如果它是教程/知识/方法，就提炼真实行动；如果它偏娱乐/审美/图文，就转成“回看这条灵感并决定是否要做”的轻量提醒，不要直接丢弃。

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
  "folder": "默认|美食|身体|工作|知识|关系|杂物",
  "commitment_summary": "≤25字，必须非空",
  "executable_steps": ["≤15字，必须具体", "≤15字", "≤15字"],
  "estimated_cost": "5分钟|15分钟|半小时|半天|更长",
  "best_push_window": "饭点前|周末早上|工作日晚上|睡前|通勤时段|随时",
  "tone_hint": "焦虑型|向往型|兴趣型|实用型"
}

要求：
- 任何可读分享都尽量进入提醒队列。
- 纯娱乐也可以变成“5分钟回看并决定是否放下”。
- 不要编造视频里没有的专业步骤。`,
    });

    if (!raw.is_real_commitment) {
      return fallbackAnalysis(parsed, raw.noise_reason || "内容偏娱乐，转为轻量回看提醒");
    }

    return {
      ...raw,
      is_real_commitment: true,
      commitment_summary: raw.commitment_summary || fallbackAnalysis(parsed).commitment_summary,
      executable_steps: raw.executable_steps.length ? raw.executable_steps : fallbackAnalysis(parsed).executable_steps,
    };
  } catch (error) {
    return fallbackAnalysis(parsed, error instanceof Error ? error.message : "LLM 分析失败，使用兜底提醒");
  }
}

export async function summarizeSavedItems(items: SavedItem[]): Promise<SummaryResult> {
  if (!items.length) return fallbackSummary(items, "当前没有待总结的数据。");

  const compactItems = items.slice(0, 20).map((item, index) => ({
    index: index + 1,
    title: item.title || "抖音分享",
    description: item.description || "",
    author: item.author || "",
    tags: item.tags ?? [],
    share_text: item.raw_share_text || "",
  }));

  try {
    return await chatJson({
      model: config.llmModelAnalyze,
      schema: summarySchema,
      temperature: 0.35,
      system:
        "你是「念念」的批量整理引擎。用户把一批抖音收藏丢给你，你要把它们压缩成 1-2 条低压力、可执行的提醒内容。只输出严格 JSON。",
      user: `请总结当前这批收藏，生成 1-2 条适合直接推送给用户的提醒内容。

【重要原则】
- 不过滤、不丢弃用户收藏。
- 不要逐条生成提醒，要把整批收藏压缩成 1-2 个方向。
- 内容很杂时，生成“回看本批收藏，挑一个行动点”的低压力提醒。
- 不要编造视频里没有的具体事实；只能基于标题、描述、分享文案做保守归纳。
- 标题要短，正文要像提醒，不要像报告。

【当前收藏，共 ${items.length} 条】
${JSON.stringify(compactItems, null, 2)}

【输出 JSON】
{
  "summary": "≤80字，概括这批收藏",
  "suggestions": [
    {
      "title": "≤18字提醒标题",
      "body": "≤80字推送正文",
      "steps": ["≤18字", "≤18字", "≤18字"],
      "estimated_cost": "5分钟|15分钟|半小时|半天|更长",
      "best_push_window": "饭点前|周末早上|工作日晚上|睡前|通勤时段|随时",
      "tone_hint": "兴趣型|实用型|向往型|焦虑型"
    }
  ]
}`,
    });
  } catch (error) {
    return fallbackSummary(items, error instanceof Error ? error.message : "批量总结失败，使用兜底提醒。");
  }
}

export async function generateReminderCopy(commitment: CommitmentWithVideo): Promise<ReminderCopy> {
  const now = new Date();
  const reminders = commitment.reminders ?? [];
  const pushCount = reminders.filter((item) => item.status !== "pending").length;
  const history = reminders
    .map((item) => item.user_response)
    .filter(Boolean)
    .join(", ");

  try {
    return await chatJson({
      model: config.llmModelCopy,
      schema: copySchema,
      temperature: 0.45,
      system: "你是用户的 AI 提醒管家「念念」。只输出严格 JSON。文案克制、具体、不鸡汤。",
      user: `今天要为这条承诺推送一条温柔提醒。

【承诺信息】
- 用户想做: ${commitment.commitment_summary}
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
  } catch {
    return {
      title: "今天看一眼",
      body_main: `这条「${commitment.commitment_summary}」不用一次做完，先花 ${commitment.estimated_cost} 处理一个最小动作。`,
      body_steps_intro: "3步",
      body_steps: commitment.executable_steps.slice(0, 3),
    };
  }
}
