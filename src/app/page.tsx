import Link from "next/link";
import { BarChart3, CalendarClock, Database, ExternalLink, Sparkles } from "lucide-react";
import { countSavedItemsForToken, listCommitments, listSavedItems } from "@/lib/db";
import { relativeTime } from "@/lib/time";
import type { CommitmentWithVideo, SavedItem } from "@/lib/types";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ token?: string }>;
};

function savedItemTitle(item: SavedItem) {
  return item.title || item.description || item.raw_share_text || "未命名抖音收藏";
}

function latestReminder(item: CommitmentWithVideo) {
  return item.reminders?.[0];
}

function SavedItemRow({ item }: { item: SavedItem }) {
  return (
    <a
      href={item.original_url || item.normalized_url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-300 hover:bg-zinc-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-1 text-sm font-semibold text-zinc-950">{savedItemTitle(item)}</p>
          <p className="mt-1 line-clamp-1 text-sm text-zinc-600">
            {item.author ? `作者：${item.author}` : "等待下一次总结整理"}
          </p>
        </div>
        <span className="shrink-0 text-xs text-zinc-500">{relativeTime(item.created_at)}</span>
      </div>
    </a>
  );
}

function ReminderRow({ item, token }: { item: CommitmentWithVideo; token?: string }) {
  const reminder = latestReminder(item);
  const params = token ? `?token=${token}` : "";

  return (
    <Link
      href={`/commitment/${item.id}${params}`}
      className="block rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-300 hover:bg-zinc-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-1 text-sm font-semibold text-zinc-950">{reminder?.card_title || item.commitment_summary}</p>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-zinc-600">
            {reminder?.card_body || "这条收藏已被整理成提醒。"}
          </p>
        </div>
        <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />
      </div>
    </Link>
  );
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  let savedItems: SavedItem[] = [];
  let reminders: CommitmentWithVideo[] = [];
  let savedItemCount = 0;
  let error = "";

  try {
    savedItems = await listSavedItems({ token: params.token, limit: 8 });
    reminders = await listCommitments({ token: params.token });
    savedItemCount = await countSavedItemsForToken(params.token);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const tokenQuery = params.token ? `?token=${params.token}` : "";
  const sentReminders = reminders.filter((item) => latestReminder(item));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex items-start justify-between gap-4 py-5">
        <div>
          <p className="text-sm text-zinc-500">你的 AI 收藏管家</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950">念念控制台</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
            用户把抖音分享链接发给飞书机器人，系统先低成本收集，再通过“总结”或每周五晚 8 点自动整理成少量可回看的提醒。
          </p>
        </div>
        <Link
          href={`/insights${tokenQuery}`}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
          title="数据洞察"
        >
          <BarChart3 className="h-4 w-4" />
        </Link>
      </header>

      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          当前还没连上 Supabase：{error}
        </div>
      ) : (
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Database className="h-4 w-4" />
                当前数据列表
              </div>
              <p className="mt-2 text-3xl font-semibold text-zinc-950">{savedItemCount}</p>
              <p className="mt-1 text-sm text-zinc-500">等待下一次总结处理</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <Sparkles className="h-4 w-4" />
                已生成提醒
              </div>
              <p className="mt-2 text-3xl font-semibold text-zinc-950">{sentReminders.length}</p>
              <p className="mt-1 text-sm text-zinc-500">由历史总结批次产生</p>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sm text-zinc-500">
                <CalendarClock className="h-4 w-4" />
                自动推送
              </div>
              <p className="mt-2 text-2xl font-semibold text-zinc-950">周五 20:00</p>
              <p className="mt-1 text-sm text-zinc-500">现场可发送“测试”触发</p>
            </div>
          </section>

          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-800">当前数据列表</h2>
                <span className="text-xs text-zinc-500">{savedItems.length ? `最近 ${savedItems.length} 条` : "空"}</span>
              </div>
              {savedItems.length ? (
                <div className="space-y-2">
                  {savedItems.map((item) => (
                    <SavedItemRow key={item.id} item={item} />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-200 bg-white/70 px-4 py-6 text-sm text-zinc-500">
                  暂时没有待整理内容。向飞书机器人发送抖音分享链接后，这里会出现当前数据列表。
                </div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-800">最近生成的提醒</h2>
                <span className="text-xs text-zinc-500">{sentReminders.length}</span>
              </div>
              {sentReminders.length ? (
                <div className="space-y-2">
                  {sentReminders.slice(0, 6).map((item) => (
                    <ReminderRow key={item.id} item={item} token={params.token} />
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-zinc-200 bg-white/70 px-4 py-6 text-sm text-zinc-500">
                  还没有生成提醒。发送“总结”或“测试”后，这里会展示 AI 整理出的回看建议。
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
