import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getCommitment } from "@/lib/db";
import { relativeTime } from "@/lib/time";

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
        <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-6">没有找到这条提醒。</div>
      </main>
    );
  }

  const video = commitment.videos;
  const latestReminder = commitment.reminders?.[0];

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-4 py-6 sm:px-6">
      <Link href={backHref} className="inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-950">
        <ArrowLeft className="h-4 w-4" />
        返回控制台
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
              <span>{commitment.estimated_cost}</span>
              <span>·</span>
              <span>{relativeTime(commitment.created_at)}</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-normal text-zinc-950">
              {latestReminder?.card_title || commitment.commitment_summary}
            </h1>
            {video?.douyin_url ? (
              <a
                href={video.douyin_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 text-sm text-zinc-600 hover:text-zinc-950"
              >
                打开原视频
                <ExternalLink className="h-4 w-4" />
              </a>
            ) : null}
          </header>

          {latestReminder?.card_body ? (
            <section>
              <h2 className="text-sm font-semibold text-zinc-900">AI 提醒内容</h2>
              <p className="mt-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm leading-6 text-zinc-700">
                {latestReminder.card_body}
              </p>
            </section>
          ) : null}

          <section className="rounded-lg bg-[#f7f6f2] p-4">
            <h2 className="text-sm font-semibold text-zinc-900">来源信息</h2>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-zinc-500">建议回看时机</dt>
                <dd className="mt-1 text-zinc-900">{commitment.best_push_window}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">语气类型</dt>
                <dd className="mt-1 text-zinc-900">{commitment.tone_hint}</dd>
              </div>
            </dl>
          </section>
        </div>
      </article>
    </main>
  );
}
