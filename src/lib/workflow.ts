import {
  createCommitment,
  createSentReminder,
  countSavedItemsForUser,
  deleteCommitment,
  deleteSavedItemsByIds,
  getCommitment,
  getOrCreateUser,
  hasProcessedFeishuMessage,
  listSavedItemsForUser,
  logEvent,
  snoozeCommitment,
  updateCommitmentStatus,
  updateReminderResponse,
  updateSavedItemRawMetadata,
  upsertSavedItem,
  upsertVideo,
} from "@/lib/db";
import { config } from "@/lib/config";
import { DEFAULT_FOLDER } from "@/lib/constants";
import { extractUrls, parseDouyinUrl } from "@/lib/douyin";
import { reminderCard, sendFeishuCard, sendFeishuText, summaryPushCard, summaryPushText } from "@/lib/feishu";
import { generateReminderCopy, summarizeSavedItems } from "@/lib/llm";
import { transcribeClip } from "@/lib/asr";
import { supabaseAdmin } from "@/lib/supabase";
import type { AnalyzeResult, ParsedDouyin, SavedItem, SummarySuggestion, User } from "@/lib/types";

const SUMMARY_COMMANDS = new Set(["总结", "总结一下", "整理", "整理一下", "生成提醒", "生成推送"]);
const WEEKLY_TEST_COMMANDS = new Set(["测试", "测试推送", "测试周推送", "测试每周推送"]);

type SummaryMode = "manual" | "weekly";

type SummarizeUserOptions = {
  openId?: string;
  mode?: SummaryMode;
  maxSuggestions?: number;
  notifyWhenEmpty?: boolean;
  notifyOnFailure?: boolean;
};

function metadataString(item: SavedItem, key: string) {
  const value = item.raw_metadata?.[key];
  return typeof value === "string" ? value : "";
}

function metadataNumber(item: SavedItem, key: string) {
  const value = item.raw_metadata?.[key];
  return typeof value === "number" ? value : null;
}

function isNoteLink(url: string) {
  return /\/(?:share\/)?note\//.test(url);
}

function isSummaryCommand(text: string) {
  const normalized = text.replace(/[\s。.!！]/g, "");
  return SUMMARY_COMMANDS.has(normalized);
}

function isWeeklyTestCommand(text: string) {
  const normalized = text.replace(/[\s。.!！]/g, "");
  return WEEKLY_TEST_COMMANDS.has(normalized);
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
    asrText: metadataString(item, "asrText") || "",
    playAddr: metadataString(item, "playAddr") || null,
    durationMs: metadataNumber(item, "durationMs"),
    rawMetadata: item.raw_metadata ?? {},
  };
}

function sourceItemForSuggestion(items: SavedItem[], sourceIndex: number) {
  const index = Number.isFinite(sourceIndex) ? Math.max(0, Math.min(items.length - 1, sourceIndex - 1)) : 0;
  return items[index] ?? items[0];
}

function unknownErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function enrichUniqueSuggestions(items: SavedItem[], suggestions: SummarySuggestion[], maxSuggestions = 2) {
  const seenItemIds = new Set<string>();
  const enriched: SummarySuggestion[] = [];
  const maxCount = Math.min(maxSuggestions, items.length);

  for (const suggestion of suggestions) {
    const source = sourceItemForSuggestion(items, suggestion.source_index);
    if (!source || seenItemIds.has(source.id)) continue;
    seenItemIds.add(source.id);
    enriched.push({
      ...suggestion,
      source_index: items.indexOf(source) + 1,
      video_url: source.original_url || source.normalized_url,
    });
    if (enriched.length >= maxCount) break;
  }

  return enriched;
}

async function enrichItemsWithAsr(user: User, items: SavedItem[], requestedMaxItems = config.asrSummaryMaxItems) {
  const maxItems = Math.max(0, requestedMaxItems);
  if (!config.enableAsr || maxItems === 0) return items;

  const enriched = [...items];
  let attempted = 0;
  let transcribed = 0;

  for (let index = 0; index < enriched.length && attempted < maxItems; index += 1) {
    const item = enriched[index];
    if (metadataString(item, "asrText")) continue;
    if (isNoteLink(item.normalized_url) || isNoteLink(item.original_url)) continue;

    const playAddr = metadataString(item, "playAddr");
    if (!playAddr) continue;

    attempted += 1;
    const transcript = await transcribeClip(playAddr);
    const rawMetadata = {
      ...(item.raw_metadata ?? {}),
      asrSource: transcript.source,
      asrSkipReason: transcript.skipReason,
      asrBytes: transcript.bytesDownloaded,
      asrTruncated: transcript.truncated,
      asrCheckedAt: new Date().toISOString(),
      ...(transcript.text ? { asrText: transcript.text } : {}),
    };

    try {
      enriched[index] = await updateSavedItemRawMetadata(user.id, item.id, rawMetadata);
    } catch (error) {
      enriched[index] = { ...item, raw_metadata: rawMetadata };
      await logEvent(user.id, "saved_item_asr_cache_failed", {
        saved_item_id: item.id,
        message: unknownErrorMessage(error),
      });
    }

    if (transcript.text) transcribed += 1;
  }

  if (attempted > 0) {
    await logEvent(user.id, "saved_items_asr_enriched", {
      item_count: items.length,
      attempted,
      transcribed,
    });
  }

  return enriched;
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
    await summarizeUserSavedItems(user, {
      openId: input.openId,
      mode: "manual",
      maxSuggestions: 2,
      notifyWhenEmpty: true,
      notifyOnFailure: true,
    });
    return;
  }

  if (isWeeklyTestCommand(input.text)) {
    await sendFeishuText(input.openId, "收到，正在生成本周测试推送。视频转写需要一点时间，稍后会发卡片。");
    await summarizeUserSavedItems(user, {
      openId: input.openId,
      mode: "weekly",
      maxSuggestions: 4,
      notifyWhenEmpty: true,
      notifyOnFailure: true,
    });
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
      `${created ? "已添加到数据列表。" : "这条已经在数据列表里。"}当前 ${count} 条。${
        isNoteLink(parsed.normalizedUrl)
          ? "\n提示：这条可能是图文，MVP 暂不支持图文音频识别，后续总结会以分享文案为准。"
          : ""
      }`,
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

export async function summarizeUserSavedItems(user: User, options: SummarizeUserOptions = {}) {
  const mode = options.mode ?? "manual";
  const openId = options.openId ?? user.feishu_open_id;
  const maxSuggestions = Math.max(1, Math.min(options.maxSuggestions ?? (mode === "weekly" ? 4 : 2), 5));
  const notifyWhenEmpty = options.notifyWhenEmpty ?? mode === "manual";
  const notifyOnFailure = options.notifyOnFailure ?? mode === "manual";
  const items = await listSavedItemsForUser(user.id);
  if (!items.length) {
    if (notifyWhenEmpty) {
      await sendFeishuText(openId, "当前数据列表为空，先发几条抖音链接给我。");
    }
    return { ok: true, skipped: "empty", itemCount: 0, suggestionCount: 0, remainingCount: 0 };
  }

  try {
    const enrichedItems = await enrichItemsWithAsr(user, items, config.asrSummaryMaxItems);
    const result = await summarizeSavedItems(enrichedItems, { mode, maxSuggestions });
    const suggestions = enrichUniqueSuggestions(enrichedItems, result.suggestions, maxSuggestions);
    if (!suggestions.length) throw new Error("No summary suggestions generated");

    for (const suggestion of suggestions) {
      const source = sourceItemForSuggestion(enrichedItems, suggestion.source_index);
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

    const selectedItemIds = suggestions.map((suggestion) => sourceItemForSuggestion(enrichedItems, suggestion.source_index).id);
    const selectedCount = new Set(selectedItemIds).size;
    const remainingCount = Math.max(0, items.length - selectedCount);

    const finalResult = { ...result, suggestions };
    try {
      await sendFeishuCard(openId, summaryPushCard(finalResult, items.length, remainingCount, mode));
    } catch (cardError) {
      await logEvent(user.id, "summary_card_send_failed", {
        message: unknownErrorMessage(cardError),
      });
      await sendFeishuText(openId, summaryPushText(finalResult, items.length, remainingCount, mode).replace(/\*\*/g, ""));
    }
    await deleteSavedItemsByIds(user.id, selectedItemIds);
    await logEvent(user.id, "saved_items_summarized", {
      item_count: items.length,
      suggestion_count: suggestions.length,
      remaining_count: remainingCount,
      mode,
      summary: result.summary,
    });
    return { ok: true, itemCount: items.length, suggestionCount: suggestions.length, remainingCount };
  } catch (error) {
    const message = unknownErrorMessage(error);
    await logEvent(user.id, "saved_items_summary_failed", {
      item_count: items.length,
      mode,
      message,
    });
    if (notifyOnFailure) {
      await sendFeishuText(openId, "这批数据暂时总结失败。数据列表还在，你可以稍后再发送“总结”。");
    }
    return { ok: false, itemCount: items.length, suggestionCount: 0, remainingCount: items.length, error: message };
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
