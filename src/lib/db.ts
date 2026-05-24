import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase";
import { nextDefaultPushTime } from "@/lib/time";
import type {
  AnalyzeResult,
  Commitment,
  CommitmentStatus,
  CommitmentWithVideo,
  ParsedDouyin,
  Reminder,
  SavedItem,
  SummarySuggestion,
  User,
} from "@/lib/types";

export async function getOrCreateUser(input: {
  feishuOpenId: string;
  feishuUserId?: string | null;
  name?: string | null;
}) {
  const supabase = supabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from("users")
    .select("*")
    .eq("feishu_open_id", input.feishuOpenId)
    .maybeSingle<User>();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from("users")
    .insert({
      feishu_open_id: input.feishuOpenId,
      feishu_user_id: input.feishuUserId ?? null,
      name: input.name ?? null,
      dashboard_token: crypto.randomBytes(18).toString("hex"),
    })
    .select("*")
    .single<User>();

  if (error) throw error;
  return data;
}

export async function upsertVideo(userId: string, parsed: ParsedDouyin) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("videos")
    .upsert(
      {
        user_id: userId,
        douyin_url: parsed.originalUrl,
        normalized_url: parsed.normalizedUrl,
        video_id: parsed.videoId,
        title: parsed.title,
        description: parsed.description,
        author: parsed.author,
        cover_url: parsed.coverUrl,
        tags: parsed.tags,
        asr_text: parsed.asrText,
        raw_metadata: parsed.rawMetadata,
        status: "ready",
      },
      { onConflict: "user_id,normalized_url" },
    )
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function upsertSavedItem(userId: string, parsed: ParsedDouyin, rawShareText: string) {
  const supabase = supabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from("saved_items")
    .select("*")
    .eq("user_id", userId)
    .eq("normalized_url", parsed.normalizedUrl)
    .maybeSingle<SavedItem>();

  if (existingError) throw existingError;
  if (existing) return { item: existing, created: false };

  const { data, error } = await supabase
    .from("saved_items")
    .insert({
      user_id: userId,
      original_url: parsed.originalUrl,
      normalized_url: parsed.normalizedUrl,
      video_id: parsed.videoId,
      title: parsed.title,
      description: parsed.description,
      author: parsed.author,
      cover_url: parsed.coverUrl,
      tags: parsed.tags,
      raw_share_text: rawShareText,
      raw_metadata: {
        ...parsed.rawMetadata,
        asrText: parsed.asrText,
        playAddr: parsed.playAddr,
        durationMs: parsed.durationMs,
      },
    })
    .select("*")
    .single<SavedItem>();

  if (error) throw error;
  return { item: data, created: true };
}

export async function listSavedItemsForUser(userId: string) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("saved_items")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .returns<SavedItem[]>();

  if (error) throw error;
  return data ?? [];
}

export async function countSavedItemsForUser(userId: string) {
  const supabase = supabaseAdmin();
  const { count, error } = await supabase
    .from("saved_items")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw error;
  return count ?? 0;
}

export async function countSavedItemsForToken(token?: string) {
  const supabase = supabaseAdmin();
  let userId: string | null = null;

  if (token) {
    const { data: user, error } = await supabase
      .from("users")
      .select("id")
      .eq("dashboard_token", token)
      .maybeSingle<{ id: string }>();
    if (error) throw error;
    if (!user) return 0;
    userId = user.id;
  }

  let query = supabase.from("saved_items").select("*", { count: "exact", head: true });
  if (userId) query = query.eq("user_id", userId);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function listUsersWithSavedItems() {
  const supabase = supabaseAdmin();
  const { data: rows, error: rowsError } = await supabase
    .from("saved_items")
    .select("user_id")
    .order("created_at", { ascending: true });

  if (rowsError) throw rowsError;

  const userIds = Array.from(new Set((rows ?? []).map((row) => row.user_id).filter(Boolean)));
  if (!userIds.length) return [];

  const { data, error } = await supabase.from("users").select("*").in("id", userIds).returns<User[]>();
  if (error) throw error;

  return data ?? [];
}

export async function deleteSavedItemsForUser(userId: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("saved_items").delete().eq("user_id", userId);
  if (error) throw error;
}

export async function deleteSavedItemsByIds(userId: string, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids)).filter(Boolean);
  if (!uniqueIds.length) return;

  const supabase = supabaseAdmin();
  const { error } = await supabase.from("saved_items").delete().eq("user_id", userId).in("id", uniqueIds);
  if (error) throw error;
}

export async function updateSavedItemRawMetadata(userId: string, id: string, rawMetadata: Record<string, unknown>) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("saved_items")
    .update({ raw_metadata: rawMetadata })
    .eq("user_id", userId)
    .eq("id", id)
    .select("*")
    .single<SavedItem>();

  if (error) throw error;
  return data;
}

export async function createCommitment(
  userId: string,
  videoId: string,
  analysis: AnalyzeResult,
  options?: { skipDedupe?: boolean },
) {
  const supabase = supabaseAdmin();
  if (!options?.skipDedupe) {
    const { data: existing, error: existingError } = await supabase
      .from("commitments")
      .select("*")
      .eq("user_id", userId)
      .eq("video_id", videoId)
      .neq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<Commitment>();

    if (existingError) throw existingError;
    if (existing) return existing;
  }

  const status = "pending";
  const { data, error } = await supabase
    .from("commitments")
    .insert({
      user_id: userId,
      video_id: videoId,
      is_real_commitment: analysis.is_real_commitment,
      folder: analysis.folder,
      commitment_summary: analysis.commitment_summary,
      executable_steps: analysis.executable_steps,
      estimated_cost: analysis.estimated_cost,
      best_push_window: analysis.best_push_window,
      tone_hint: analysis.tone_hint,
      status,
    })
    .select("*")
    .single<Commitment>();

  if (error) throw error;
  return data;
}

export async function createDefaultReminder(userId: string, commitmentId: string) {
  const supabase = supabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from("reminders")
    .select("*")
    .eq("user_id", userId)
    .eq("commitment_id", commitmentId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Reminder>();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await supabase
    .from("reminders")
    .insert({
      user_id: userId,
      commitment_id: commitmentId,
      scheduled_at: nextDefaultPushTime().toISOString(),
      status: "pending",
    })
    .select("*")
    .single<Reminder>();

  if (error) throw error;
  return data;
}

export async function createSentReminder(userId: string, commitmentId: string, suggestion: SummarySuggestion) {
  const supabase = supabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("reminders")
    .insert({
      user_id: userId,
      commitment_id: commitmentId,
      scheduled_at: now,
      sent_at: now,
      card_title: suggestion.title,
      card_body: suggestion.video_summary,
      card_payload: suggestion,
      status: "sent",
    })
    .select("*")
    .single<Reminder>();

  if (error) throw error;
  return data;
}

export async function listCommitments(filters?: {
  token?: string;
  status?: string;
}) {
  const supabase = supabaseAdmin();
  let query = supabase
    .from("commitments")
    .select("*, videos(*), reminders(*)")
    .order("created_at", { ascending: false });

  if (filters?.status) query = query.eq("status", filters.status);

  if (filters?.token) {
    const { data: user, error } = await supabase
      .from("users")
      .select("id")
      .eq("dashboard_token", filters.token)
      .maybeSingle<{ id: string }>();
    if (error) throw error;
    if (!user) return [];
    query = query.eq("user_id", user.id);
  }

  const { data, error } = await query.returns<CommitmentWithVideo[]>();
  if (error) throw error;
  return data ?? [];
}

export async function getCommitment(id: string, token?: string) {
  const supabase = supabaseAdmin();
  let query = supabase.from("commitments").select("*, videos(*), reminders(*)").eq("id", id);

  if (token) {
    const { data: user, error } = await supabase
      .from("users")
      .select("id")
      .eq("dashboard_token", token)
      .maybeSingle<{ id: string }>();
    if (error) throw error;
    if (!user) return null;
    query = query.eq("user_id", user.id);
  }

  const { data, error } = await query.maybeSingle<CommitmentWithVideo>();
  if (error) throw error;
  return data;
}

export async function updateCommitmentStatus(id: string, status: CommitmentStatus) {
  const supabase = supabaseAdmin();
  const patch: Record<string, string | null> = { status };
  if (status === "fulfilled") patch.fulfilled_at = new Date().toISOString();
  if (status === "abandoned") patch.abandoned_at = new Date().toISOString();

  const { data, error } = await supabase.from("commitments").update(patch).eq("id", id).select("*").single<Commitment>();
  if (error) throw error;
  return data;
}

export async function updateReminderResponse(commitmentId: string, response: "done" | "snooze" | "skip") {
  const supabase = supabaseAdmin();
  const { data: latest, error: latestError } = await supabase
    .from("reminders")
    .select("*")
    .eq("commitment_id", commitmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<Reminder>();

  if (latestError) throw latestError;
  if (!latest) return null;

  const status = response === "done" ? "done" : response === "snooze" ? "snoozed" : "skipped";
  const { data, error } = await supabase
    .from("reminders")
    .update({
      status,
      user_response: response,
      snooze_count: response === "snooze" ? latest.snooze_count + 1 : latest.snooze_count,
    })
    .eq("id", latest.id)
    .select("*")
    .single<Reminder>();

  if (error) throw error;
  return data;
}

export async function snoozeCommitment(commitmentId: string, userId: string, days = 7) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("reminders")
    .insert({
      commitment_id: commitmentId,
      user_id: userId,
      scheduled_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
      status: "pending",
    })
    .select("*")
    .single<Reminder>();
  if (error) throw error;
  return data;
}

export async function deleteCommitment(id: string) {
  const supabase = supabaseAdmin();
  const { error } = await supabase.from("commitments").delete().eq("id", id);
  if (error) throw error;
}

export async function hasProcessedFeishuMessage(messageId: string) {
  const supabase = supabaseAdmin();
  const { data, error } = await supabase
    .from("events")
    .select("id")
    .eq("event_type", "feishu_message_received")
    .filter("payload->>message_id", "eq", messageId)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (error) throw error;
  return Boolean(data);
}

export async function logEvent(userId: string | null, eventType: string, payload?: Record<string, unknown>) {
  const supabase = supabaseAdmin();
  await supabase.from("events").insert({
    user_id: userId,
    event_type: eventType,
    payload: payload ?? {},
  });
}
