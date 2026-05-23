import {
  createCommitment,
  createDefaultReminder,
  deleteCommitment,
  getCommitment,
  getOrCreateUser,
  hasProcessedFeishuMessage,
  logEvent,
  snoozeCommitment,
  updateCommitmentStatus,
  updateReminderResponse,
  upsertVideo,
} from "@/lib/db";
import { DEFAULT_FOLDER } from "@/lib/constants";
import { extractUrls, parseDouyinUrl } from "@/lib/douyin";
import { extractFolderDirective } from "@/lib/folders";
import { analysisCard, processingCard, reminderCard, replyFeishuCard, sendFeishuCard, sendFeishuText } from "@/lib/feishu";
import { analyzeVideo, generateReminderCopy } from "@/lib/llm";
import { supabaseAdmin } from "@/lib/supabase";
import type { CommitmentWithVideo, User } from "@/lib/types";

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

  const urls = extractUrls(input.text);
  const requestedFolder = extractFolderDirective(input.text);
  if (!urls.length) {
    await sendFeishuText(input.openId, "发一条抖音分享链接给我，我会判断它是不是一个值得提醒的承诺。");
    return;
  }

  if (input.messageId) {
    await replyFeishuCard(input.messageId, processingCard()).catch(() => sendFeishuCard(input.openId, processingCard()));
  } else {
    await sendFeishuCard(input.openId, processingCard());
  }

  await logEvent(user.id, "video_received", { text: input.text, url: urls[0] });

  try {
    const parsed = await parseDouyinUrl(urls[0], input.text);
    const video = await upsertVideo(user.id, parsed);
    const analysis = await analyzeVideo(parsed);
    analysis.folder = requestedFolder ?? DEFAULT_FOLDER;
    const commitment = await createCommitment(user.id, video.id, analysis, { forceFolder: Boolean(requestedFolder) });
    const full = (await getCommitment(commitment.id)) as CommitmentWithVideo;

    await logEvent(user.id, "video_processed", { video_id: video.id, commitment_id: commitment.id, analysis });

    await createDefaultReminder(user.id, commitment.id);
    const withReminder = (await getCommitment(commitment.id)) as CommitmentWithVideo;
    await sendFeishuCard(input.openId, analysisCard(withReminder ?? full, user));
  } catch (error) {
    await logEvent(user.id, "video_processing_failed", {
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

export async function pushReminderNow(commitmentId: string) {
  const commitment = await getCommitment(commitmentId);
  if (!commitment) throw new Error("Commitment not found");

  const supabase = supabaseAdmin();
  const { data: user, error } = await supabase.from("users").select("*").eq("id", commitment.user_id).single<User>();
  if (error) throw error;

  const copy = await generateReminderCopy(commitment);
  await sendFeishuCard(user.feishu_open_id, reminderCard(commitment, copy, user));

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
