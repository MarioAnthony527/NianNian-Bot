export type CommitmentStatus = "pending" | "fulfilled" | "abandoned" | "archived" | "failed";
export type ReminderStatus = "pending" | "sent" | "done" | "snoozed" | "skipped" | "failed";
export type FolderName = string;

export type User = {
  id: string;
  name: string | null;
  feishu_user_id: string | null;
  feishu_open_id: string;
  dashboard_token: string;
  push_time_pref: string;
  created_at: string;
};

export type Video = {
  id: string;
  user_id: string;
  douyin_url: string;
  normalized_url: string;
  video_id: string | null;
  title: string | null;
  description: string | null;
  author: string | null;
  cover_url: string | null;
  tags: string[] | null;
  asr_text: string | null;
  raw_metadata: Record<string, unknown> | null;
  status: "processing" | "ready" | "failed";
  created_at: string;
};

export type Commitment = {
  id: string;
  video_id: string;
  user_id: string;
  is_real_commitment: boolean;
  folder: FolderName;
  commitment_summary: string;
  executable_steps: string[];
  estimated_cost: string;
  best_push_window: string;
  tone_hint: string;
  status: CommitmentStatus;
  fulfilled_at: string | null;
  abandoned_at: string | null;
  created_at: string;
};

export type Reminder = {
  id: string;
  commitment_id: string;
  user_id: string;
  scheduled_at: string;
  sent_at: string | null;
  card_title: string | null;
  card_body: string | null;
  card_payload: Record<string, unknown> | null;
  status: ReminderStatus;
  user_response: string | null;
  snooze_count: number;
  created_at: string;
};

export type CommitmentWithVideo = Commitment & {
  videos: Video | null;
  reminders?: Reminder[];
};

export type AnalyzeResult = {
  is_real_commitment: boolean;
  noise_reason: string;
  folder: FolderName;
  commitment_summary: string;
  executable_steps: string[];
  estimated_cost: "5分钟" | "15分钟" | "半小时" | "半天" | "更长" | string;
  best_push_window: "饭点前" | "周末早上" | "工作日晚上" | "睡前" | "通勤时段" | "随时" | string;
  tone_hint: "焦虑型" | "向往型" | "兴趣型" | "实用型" | string;
};

export type ReminderCopy = {
  title: string;
  body_main: string;
  body_steps_intro: string;
  body_steps: string[];
};

export type ParsedDouyin = {
  originalUrl: string;
  normalizedUrl: string;
  videoId: string | null;
  title: string;
  description: string;
  author: string;
  coverUrl: string | null;
  tags: string[];
  asrText: string;
  playAddr: string | null;
  durationMs: number | null;
  rawMetadata: Record<string, unknown>;
};
