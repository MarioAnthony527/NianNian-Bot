create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text,
  feishu_user_id text unique,
  feishu_open_id text unique not null,
  dashboard_token text unique not null default encode(gen_random_bytes(18), 'hex'),
  push_time_pref time default '09:00:00',
  created_at timestamptz default now()
);

create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  douyin_url text not null,
  normalized_url text not null,
  video_id text,
  title text,
  description text,
  author text,
  cover_url text,
  tags text[],
  asr_text text,
  raw_metadata jsonb,
  status text default 'processing' check (status in ('processing', 'ready', 'failed')),
  created_at timestamptz default now(),
  unique(user_id, normalized_url)
);

create table if not exists commitments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references videos(id) on delete cascade not null,
  user_id uuid references users(id) on delete cascade not null,
  is_real_commitment boolean not null,
  folder text not null default '全部',
  commitment_summary text not null default '',
  executable_steps jsonb not null default '[]'::jsonb,
  estimated_cost text not null default '15分钟',
  best_push_window text not null default '随时',
  tone_hint text not null default '实用型',
  status text default 'pending' check (status in ('pending', 'fulfilled', 'abandoned', 'archived', 'failed')),
  fulfilled_at timestamptz,
  abandoned_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_commitments_user_status on commitments(user_id, status);
create index if not exists idx_commitments_user_folder on commitments(user_id, folder);

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  commitment_id uuid references commitments(id) on delete cascade not null,
  user_id uuid references users(id) on delete cascade not null,
  scheduled_at timestamptz not null,
  sent_at timestamptz,
  card_title text,
  card_body text,
  card_payload jsonb,
  status text default 'pending' check (status in ('pending', 'sent', 'done', 'snoozed', 'skipped', 'failed')),
  user_response text,
  snooze_count int default 0,
  created_at timestamptz default now()
);

create index if not exists idx_reminders_status_scheduled on reminders(status, scheduled_at);
create index if not exists idx_reminders_user_commitment on reminders(user_id, commitment_id);

create table if not exists saved_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade not null,
  original_url text not null,
  normalized_url text not null,
  video_id text,
  title text,
  description text,
  author text,
  cover_url text,
  tags text[],
  raw_share_text text,
  raw_metadata jsonb,
  created_at timestamptz default now(),
  unique(user_id, normalized_url)
);

create index if not exists idx_saved_items_user_created_at on saved_items(user_id, created_at desc);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  event_type text not null,
  payload jsonb,
  created_at timestamptz default now()
);

grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
