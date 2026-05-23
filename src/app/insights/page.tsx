import Link from "next/link";
import { ArrowLeft, BarChart3 } from "lucide-react";
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
        <h2 className="text-sm font-semibold text-zinc-900">一句洞察</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-700">
          {fulfilled
            ? "已经有承诺被兑现。继续保留少量、真实、能执行的事情。"
            : commitments.length
              ? "提醒已经生成。先挑一条成本最低的开始，不需要一次完成。"
              : "承诺还在积累中。先在飞书发送几条链接，再发送“总结”生成推送内容。"}
        </p>
      </section>
    </main>
  );
}
