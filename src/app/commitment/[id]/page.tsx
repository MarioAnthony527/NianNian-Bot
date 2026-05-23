import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Send } from "lucide-react";
import { getCommitment, listFoldersForUser } from "@/lib/db";
import { defaultFolderNames } from "@/lib/folders";
import { relativeTime } from "@/lib/time";
import { DemoPushButton } from "@/components/DemoPushButton";
import { FolderEditor } from "@/components/FolderEditor";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function CommitmentDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { token } = await searchParams;
  const commitment = await getCommitment(id, token);
  const backHref = token ? `/?token=${token}` : "/";

  if (!commitment) {
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-zinc-600">
          <ArrowLeft className="h-4 w-4" />
          返回
        </Link>
        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6">没有找到这条承诺。</div>
      </main>
    );
  }

  const steps = Array.isArray(commitment.executable_steps) ? commitment.executable_steps : [];
  const video = commitment.videos;
  const folders = Array.from(new Set([...defaultFolderNames(), ...(await listFoldersForUser(commitment.user_id))]));

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-6 sm:px-6">
      <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-950">
        <ArrowLeft className="h-4 w-4" />
        返回承诺台
      </Link>

      <article className="mt-5 overflow-hidden rounded-lg border border-zinc-200 bg-white">
        {video?.cover_url ? (
          <div className="relative aspect-video bg-zinc-100">
            <Image src={video.cover_url} alt={video.title ?? "抖音封面"} fill className="object-cover" unoptimized />
          </div>
        ) : null}

        <div className="space-y-6 p-5 sm:p-6">
          <header>
            <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
              <span>{commitment.folder}</span>
              <span>·</span>
              <span>{commitment.estimated_cost}</span>
              <span>·</span>
              <span>{relativeTime(commitment.created_at)}</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-zinc-950">{commitment.commitment_summary}</h1>
            {video?.douyin_url ? (
              <a href={video.douyin_url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-950">
                原视频
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
          </header>

          <section className="rounded-lg bg-[#f7f6f2] p-4">
            <h2 className="text-sm font-semibold text-zinc-900">AI 理解</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-zinc-500">推送窗口</dt>
                <dd className="mt-1 text-zinc-900">{commitment.best_push_window}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">情绪基调</dt>
                <dd className="mt-1 text-zinc-900">{commitment.tone_hint}</dd>
              </div>
            </dl>
          </section>

          <section className="border-y border-zinc-100 py-4">
            <FolderEditor commitmentId={commitment.id} currentFolder={commitment.folder} folders={folders} />
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              也可以在飞书里把链接发成“#旅行 https://...”“#旅行https://...”或“文件夹:旅行 https://...”。只有消息开头的 # 会被当作收藏夹，抖音自带话题会被忽略。
            </p>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-zinc-900">可执行步骤</h2>
            <ol className="mt-3 space-y-2">
              {steps.map((step, index) => (
                <li key={`${step}-${index}`} className="flex gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm">
                  <span className="text-zinc-400">{index + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-5">
            <DemoPushButton commitmentId={commitment.id} />
            <button type="button" className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 text-sm text-zinc-700">
              <Send className="h-4 w-4" />
              网站动作请用飞书卡片完成
            </button>
          </section>
        </div>
      </article>
    </main>
  );
}
