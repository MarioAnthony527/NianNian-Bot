import {
  createCommitment,
  createSentReminder,
  countSavedItemsForUser,
  deleteCommitment,
  deleteSavedItemsForUser,
  getCommitment,
  getOrCreateUser,
  hasProcessedFeishuMessage,
  listSavedItemsForUser,
  logEvent,
  snoozeCommitment,
  updateCommitmentStatus,
  updateReminderResponse,
  upsertSavedItem,
  upsertVideo,
} from "@/lib/db";
import { DEFAULT_FOLDER } from "@/lib/constants";
import { extractUrls, parseDouyinUrl } from "@/lib/douyin";
import { reminderCard, sendFeishuCard, sendFeishuText, summaryPushCard } from "@/lib/feishu";
import { generateReminderCopy, summarizeSavedItems } from "@/lib/llm";
import { supabaseAdmin } from "@/lib/supabase";
import type { AnalyzeResult, ParsedDouyin, SavedItem, User } from "@/lib/types";

const SUMMARY_COMMANDS = new Set(["总结", "总结一下", "整理", "整理一下", "生成提醒", "生成推送"]);

function isSummaryCommand(text: string) {
  const normalized = text.replace(/[\s。.!！]/g, "");
  return SUMMARY_COMMANDS.has(normalized);
}

function savedItemToParsed(item: SavedItem): ParsedDouyin {
  return {
    originalUrl: item.original_url,
    normalizedUrl: item.normalized_url,
    videoId: item.video_id,
    title: item.title || "本批收藏汇总",
    description: item.description || item.raw_share_text || item.title || "用户收藏的视频内容",
    author: item.author || "",
    coverUrl: item.cover_url,
    tags: item.tags ?? [],
    asrText: item.raw_share_text || item.description || "",
    rawMetadata: item.raw_metadata ?? {},
  };
}

function sourceItemForSuggestion(items: SavedItem[], sourceIndex: number) {
  const index = Number.isFinite(sourceIndex) ? Math.max(0, Math.min(items.length - 1, sourceIndex - 1)) : 0;
  return items[index] ?? items[0];
}

export async function handleIncomingFeishuMessage(input: {
  openId: string;
  userId?: string | null;
  name?: string | null;
  messageId?: string | null;
  text: string;
}) {
  const user = await getOrCreateUser({
    feishuOpenId: input.openId,
    feishuUserId: input.userId,
    name: input.name,
  });

  if (input.messageId) {
    const alreadyProcessed = await hasProcessedFeishuMessage(input.messageId);
    if (alreadyProcessed) return;
    await logEvent(user.id, "feishu_message_received", { message_id: input.messageId, text: input.text });
  }

  if (isSummaryCommand(input.text)) {
    await summarizeCurrentSavedItems(user, input.openId);
    return;
  }

  const urls = extractUrls(input.text);
  if (!urls.length) {
    await sendFeishuText(input.openId, "发抖音分享链接给我，我会先加入数据列表。发送“总结”即可生成推送内容。");
    return;
  }

  await logEvent(user.id, "video_received", { text: input.text, url: urls[0] });

  try {
    const parsed = await parseDouyinUrl(urls[0], input.text);
    const { item, created } = await upsertSavedItem(user.id, parsed, input.text);
    const count = await countSavedItemsForUser(user.id);

    await logEvent(user.id, created ? "saved_item_created" : "saved_item_duplicate", {
      saved_item_id: item.id,
      url: urls[0],
    });

    await sendFeishuText(
      input.openId,
      created
        ? `已添加到数据列表。当前 ${count} 条。发送“总结”即可生成推送内容。`
        : `这条已经在数据列表里。当前 ${count} 条。发送“总结”即可生成推送内容。`,
    );
  } catch (error) {
    await logEvent(user.id, "saved_item_failed", {
      message: error instanceof Error ? error.message : String(error),
      url: urls[0],
    });
    await sendFeishuText(
      input.openId,
      error instanceof Error && error.message.includes("读不到内容")
        ? error.message
        : "这条链接暂时处理失败。可以换一条公开分享链接再试一次。",
    );
  }
}

async function summarizeCurrentSavedItems(user: User, openId: string) {
  const items = await listSavedItemsForUser(user.id);
  if (!items.length) {
    await sendFeishuText(openId, "当前数据列表为空，先发几条抖音链接给我。");
    return;
  }

  try {
    const result = await summarizeSavedItems(items);
    const suggestions = result.suggestions.slice(0, 2).map((suggestion) => {
      const source = sourceItemForSuggestion(items, suggestion.source_index);
      return {
        ...suggestion,
        source_index: items.indexOf(source) + 1,
        video_url: source.normalized_url || source.original_url,
      };
    });

    for (const suggestion of suggestions) {
      const source = sourceItemForSuggestion(items, suggestion.source_index);
      const video = await upsertVideo(user.id, savedItemToParsed(source));
      const analysis: AnalyzeResult = {
        is_real_commitment: true,
        noise_reason: "",
        folder: DEFAULT_FOLDER,
        commitment_summary: suggestion.title,
        executable_steps: [],
        estimated_cost: suggestion.estimated_cost,
        best_push_window: suggestion.best_push_window,
        tone_hint: suggestion.tone_hint,
      };
      const commitment = await createCommitment(user.id, video.id, analysis, { skipDedupe: true });
      await createSentReminder(user.id, commitment.id, suggestion);
    }

    await sendFeishuCard(openId, summaryPushCard({ ...result, suggestions }, items.length));
    await deleteSavedItemsForUser(user.id);
    await logEvent(user.id, "saved_items_summarized", {
      item_count: items.length,
      suggestion_count: suggestions.length,
      summary: result.summary,
    });
  } catch (error) {
    await logEvent(user.id, "saved_items_summary_failed", {
      item_count: items.length,
      message: error instanceof Error ? error.message : String(error),
    });
    await sendFeishuText(openId, "这批数据暂时总结失败。数据列表还在，你可以稍后再发送“总结”。");
  }
}

export async function pushReminderNow(commitmentId: string) {
  const commitment = await getCommitment(commitmentId);
  if (!commitment) throw new Error("Commitment not found");

  const supabase = supabaseAdmin();
  const { data: user, error } = await supabase.from("users").select("*").eq("id", commitment.user_id).single<User>();
  if (error) throw error;

  const copy = await generateReminderCopy(commitment);
  await sendFeishuCard(user.feishu_open_id, reminderCard(copy));

  const { data: reminder } = await supabase
    .from("reminders")
    .insert({
      commitment_id: commitment.id,
      user_id: commitment.user_id,
      scheduled_at: new Date().toISOString(),
      sent_at: new Date().toISOString(),
      card_title: copy.title,
      card_body: copy.body_main,
      card_payload: copy,
      status: "sent",
    })
    .select("*")
    .single();

  await logEvent(commitment.user_id, "reminder_sent", { commitment_id: commitmentId, reminder_id: reminder?.id });
  return { copy, reminder };
}

export async function handleCardAction(action: string, commitmentId: string) {
  const commitment = await getCommitment(commitmentId);
  if (!commitment) throw new Error("Commitment not found");

  const supabase = supabaseAdmin();
  const { data: user, error } = await supabase.from("users").select("*").eq("id", commitment.user_id).single<User>();
  if (error) throw error;

  if (action === "done") {
    await updateReminderResponse(commitmentId, "done");
    await updateCommitmentStatus(commitmentId, "fulfilled");
    await sendFeishuText(user.feishu_open_id, "记下了。这条承诺已经移到已兑现。");
    return "已标记为做了";
  }

  if (action === "snooze") {
    await updateReminderResponse(commitmentId, "snooze");
    await snoozeCommitment(commitmentId, commitment.user_id, 7);
    await sendFeishuText(user.feishu_open_id, "好，7 天后再提醒你。");
    return "已推迟 7 天";
  }

  if (action === "skip") {
    await updateReminderResponse(commitmentId, "skip");
    await updateCommitmentStatus(commitmentId, "abandoned");
    await sendFeishuText(user.feishu_open_id, "好的，放下也是一种决定。");
    return "已放下";
  }

  if (action === "delete") {
    await deleteCommitment(commitmentId);
    await sendFeishuText(user.feishu_open_id, "好，已删除。");
    return "已删除";
  }

  if (action === "push_now") {
    await pushReminderNow(commitmentId);
    return "已推送";
  }

  throw new Error(`Unknown action: ${action}`);
}
