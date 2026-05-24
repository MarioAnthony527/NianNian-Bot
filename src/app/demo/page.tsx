import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listSavedItems } from "@/lib/db";
import { relativeTime } from "@/lib/time";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function DemoPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const savedItems = await listSavedItems({ token, limit: 20 });
  const tokenQuery = token ? `?token=${token}` : "";

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-6 sm:px-6">
      <Link href={`/${tokenQuery}`} className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-950">
        <ArrowLeft className="h-4 w-4" />
        返回控制台
      </Link>

      <header className="mt-6">
        <h1 className="text-2xl font-semibold tracking-normal text-zinc-950">现场演示台</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          这里展示当前还没被总结的数据列表。给飞书机器人发送抖音链接后会进入这里；发送“测试”会模拟每周五晚 8 点的自动推送。
        </p>
      </header>

      <div className="mt-6 space-y-3">
        {savedItems.map((item) => (
          <a
            key={item.id}
            href={item.original_url || item.normalized_url}
            target="_blank"
            rel="noreferrer"
            className="block rounded-lg border border-zinc-200 bg-white p-4 hover:border-zinc-300 hover:bg-zinc-50"
          >
            <p className="line-clamp-1 font-medium text-zinc-950">
              {item.title || item.description || item.raw_share_text || "未命名抖音收藏"}
            </p>
            <p className="mt-1 text-sm text-zinc-500">{relativeTime(item.created_at)}</p>
          </a>
        ))}
        {!savedItems.length ? (
          <div className="rounded-lg border border-dashed border-zinc-200 bg-white/70 p-6 text-sm text-zinc-500">
            暂时没有待整理内容。先在飞书里发几条抖音链接给念念，再发送“测试”触发推送。
          </div>
        ) : null}
      </div>
    </main>
  );
}
