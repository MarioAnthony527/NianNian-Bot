import Link from "next/link";
import { ArrowLeft, BarChart3, Clock, Layers, Sparkles } from "lucide-react";
import { countSavedItemsForToken, listCommitments } from "@/lib/db";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function InsightsPage({ searchParams }: PageProps) {
  const { token } = await searchParams;
  const commitments = await listCommitments({ token });
  const savedItemCount = await countSavedItemsForToken(token);
  const generatedCount = commitments.filter((item) => item.reminders?.length).length;
  const tokenQuery = token ? `?token=${token}` : "";

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-6 sm:px-6">
      <Link href={`/${tokenQuery}`} className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-950">
        <ArrowLeft className="h-4 w-4" />
        返回控制台
      </Link>

      <header className="mt-6">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-900 text-white">
          <BarChart3 className="h-5 w-5" />
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-normal text-zinc-950">数据整理看板</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-600">
          当前版本关注收藏数据是否被收集、是否被 AI 整理、是否形成可点击回看的提醒。
        </p>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Layers className="h-4 w-4" />
            待整理数据
          </div>
          <p className="mt-2 text-3xl font-semibold">{savedItemCount}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Sparkles className="h-4 w-4" />
            已生成提醒
          </div>
          <p className="mt-2 text-3xl font-semibold">{generatedCount}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm text-zinc-500">
            <Clock className="h-4 w-4" />
            自动整理
          </div>
          <p className="mt-2 text-2xl font-semibold">周五 20:00</p>
        </div>
      </div>

      <section className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-zinc-900">当前整理策略</h2>
        <div className="mt-3 space-y-3 text-sm leading-6 text-zinc-700">
          <p>用户上传链接时只做轻量收集，机器人不要求分类、不要求设置提醒，降低收藏动作的心理负担。</p>
          <p>用户发送“总结”时，系统会把当前数据列表整理成少量提醒，并清空已处理的数据，避免列表长期堆积。</p>
          <p>每周五晚 8 点会自动执行同样的整理流程；现场演示可以发送“测试”立即触发周推送。</p>
        </div>
      </section>
    </main>
  );
}
