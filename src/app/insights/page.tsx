import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { FOLDERS } from "@/lib/constants";
import { listCommitments } from "@/lib/db";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function InsightsPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const commitments = await listCommitments({ token });
  const fulfilled = commitments.filter((item) => item.status === "fulfilled").length;
  const abandoned = commitments.filter((item) => item.status === "abandoned").length;
  const actionable = commitments.filter((item) => item.status !== "archived" && item.status !== "failed").length;
  const rate = actionable ? Math.round((fulfilled / actionable) * 100) : 0;
  const tokenQuery = token ? `?token=${token}` : "";
  const topAbandoned = FOLDERS.map((folder) => ({
    ...folder,
    count: commitments.filter((item) => item.status === "abandoned" && item.folder === folder.key).length,
  })).sort((a, b) => b.count - a.count)[0];

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-6 sm:px-6">
      <Link href={`/${tokenQuery}`} className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-950">
        <ArrowLeft className="h-4 w-4" />
        返回承诺台
      </Link>

      <header className="mt-6">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-white">
          <BarChart3 className="h-5 w-5" />
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-normal text-zinc-950">你的承诺地图</h1>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm text-zinc-500">兑现率</p>
          <p className="mt-2 text-3xl font-semibold">{rate}%</p>
          <p className="mt-1 text-sm text-zinc-500">{fulfilled}/{actionable}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm text-zinc-500">等待中</p>
          <p className="mt-2 text-3xl font-semibold">{commitments.filter((item) => item.status === "pending").length}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm text-zinc-500">放下</p>
          <p className="mt-2 text-3xl font-semibold">{abandoned}</p>
        </div>
      </div>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">类型分布</h2>
        <div className="mt-4 space-y-3">
          {FOLDERS.map((folder) => {
            const count = commitments.filter((item) => item.folder === folder.key).length;
            const percent = commitments.length ? Math.round((count / commitments.length) * 100) : 0;
            return (
              <div key={folder.key}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{folder.emoji} {folder.key}</span>
                  <span className="text-zinc-500">{percent}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-zinc-100">
                  <div className="h-full rounded-full bg-zinc-800" style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">一句洞察</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-700">
          {topAbandoned?.count
            ? `你放下的承诺里，「${topAbandoned.key}」最多。它可能不是不重要，只是现在成本偏高。`
            : fulfilled
              ? "本周已经有承诺被兑现。继续保留少量、真实、能执行的事情。"
              : "承诺还在积累中。先让每条都足够小，提醒才不会变成负担。"}
        </p>
      </section>
    </main>
  );
}
