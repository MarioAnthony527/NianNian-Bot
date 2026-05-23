import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listCommitments } from "@/lib/db";
import { relativeTime } from "@/lib/time";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function DemoPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const commitments = await listCommitments({ token, status: "pending" });
  const tokenQuery = token ? `?token=${token}` : "";

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-6 sm:px-6">
      <Link href={`/${tokenQuery}`} className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-950">
        <ArrowLeft className="h-4 w-4" />
        返回承诺台
      </Link>

      <header className="mt-6">
        <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">演示控制台</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          当前流程中，飞书发送“总结”会直接生成并推送内容。这里仅保留等待中的承诺列表用于核对。
        </p>
      </header>

      <div className="mt-6 space-y-3">
        {commitments.map((item) => (
          <div key={item.id} className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-zinc-950">{item.commitment_summary}</p>
              <p className="mt-1 text-sm text-zinc-500">{item.estimated_cost} · {relativeTime(item.created_at)}</p>
            </div>
          </div>
        ))}
        {!commitments.length ? (
          <div className="rounded-lg border border-dashed border-zinc-200 bg-white/70 p-6 text-sm text-zinc-500">
            暂时没有等待中的承诺。先从飞书发一条抖音链接给机器人。
          </div>
        ) : null}
      </div>
    </main>
  );
}
