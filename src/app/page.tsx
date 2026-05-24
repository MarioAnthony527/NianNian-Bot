import Link from "next/link";
import { BarChart3, ExternalLink } from "lucide-react";
import { STATUS_META } from "@/lib/constants";
import { countSavedItemsForToken, listCommitments } from "@/lib/db";
import { relativeTime } from "@/lib/time";
import type { CommitmentWithVideo } from "@/lib/types";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ token?: string; status?: string }>;
};

function stepText(commitment: CommitmentWithVideo) {
  const latestReminder = commitment.reminders?.[0];
  return latestReminder?.card_body || "已生成视频回看提醒";
}

function CommitmentRow({ item, token }: { item: CommitmentWithVideo; token?: string }) {
  const params = token ? `?token=${token}` : "";
  const status = STATUS_META[item.status] ?? STATUS_META.pending;
  return (
    <Link
      href={`/commitment/${item.id}${params}`}
      className="block rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-300 hover:bg-zinc-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-zinc-950">{item.commitment_summary}</span>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs ${status.color}`}>{status.label}</span>
          </div>
          <p className="mt-1 line-clamp-1 text-sm text-zinc-600">{stepText(item)}</p>
        </div>
        <span className="shrink-0 text-xs text-zinc-500">{relativeTime(item.created_at)}</span>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
        <span>{item.estimated_cost} · {item.best_push_window}</span>
        <ExternalLink className="h-3.5 w-3.5" />
      </div>
    </Link>
  );
}

function Section({
  title,
  items,
  token,
}: {
  title: string;
  items: CommitmentWithVideo[];
  token?: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
        <span className="text-xs text-zinc-500">{items.length}</span>
      </div>
      {items.length ? (
        <div className="space-y-2">
          {items.map((item) => (
            <CommitmentRow key={item.id} item={item} token={token} />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-zinc-200 bg-white/70 px-4 py-6 text-sm text-zinc-500">
          暂时没有内容。
        </div>
      )}
    </section>
  );
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  let commitments: CommitmentWithVideo[] = [];
  let savedItemCount = 0;
  let error = "";

  try {
    commitments = await listCommitments({
      token: params.token,
      status: params.status,
    });
    savedItemCount = await countSavedItemsForToken(params.token);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const pending = commitments.filter((item) => item.status === "pending");
  const fulfilled = commitments.filter((item) => item.status === "fulfilled");
  const abandoned = commitments.filter((item) => item.status === "abandoned");
  const tokenQuery = params.token ? `?token=${params.token}` : "";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-5 sm:px-6 lg:px-8">
      <header className="flex items-start justify-between gap-4 py-5">
        <div>
          <p className="text-sm text-zinc-500">你的 AI 承诺管家</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal text-zinc-950">你的承诺台</h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/insights${tokenQuery}`} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50" title="承诺地图">
            <BarChart3 className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          当前还没连上 Supabase：{error}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <Section title="等待兑现" items={pending} token={params.token} />
            <Section title="本周已兑现" items={fulfilled} token={params.token} />
          </div>
          <div className="space-y-6">
            <Section title="放下的承诺" items={abandoned} token={params.token} />
            <section className="rounded-lg border border-zinc-200 bg-white p-4">
              <h2 className="text-sm font-semibold text-zinc-900">当前数据列表</h2>
              <p className="mt-2 text-3xl font-semibold text-zinc-950">{savedItemCount}</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                发抖音链接会先加入这里。发送“总结”后，念念会生成推送内容并清空数据列表。
              </p>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
