import type { ParsedDouyin } from "@/lib/types";
import { config } from "@/lib/config";

const URL_PATTERN = /https?:\/\/[^\s"'<>）)，。]+/g;

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

export function extractUrls(text: string) {
  return Array.from(text.matchAll(URL_PATTERN))
    .map((match) => match[0].replace(/[.,，。)）\]]+$/, ""))
    .filter((url) => url.includes("douyin.com") || url.includes("iesdouyin.com"));
}

function extractVideoId(url: string) {
  const patterns = [/\/video\/(\d+)/, /modal_id=(\d+)/, /aweme_id=(\d+)/, /item_ids=(\d+)/, /\/share\/video\/(\d+)/];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function getMeta(html: string, key: string) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .trim();
}

async function followUrl(url: string) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": MOBILE_UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "zh-CN,zh;q=0.9",
    },
  });
  return { finalUrl: response.url || url, html: await response.text().catch(() => "") };
}

export type ItemInfoResult = {
  desc: string;
  author: string;
  cover: string | null;
  playAddr: string | null;
  durationMs: number | null;
  tags: string[];
  music: string;
  statistics: Record<string, number> | null;
  raw: Record<string, unknown>;
};

function tryRouterData(html: string): ItemInfoResult | null {
  const match = html.match(/window\._ROUTER_DATA\s*=\s*([\s\S]*?)<\/script>/);
  if (!match) return null;
  const raw = match[1].trim().replace(/;\s*$/, "");
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const loaderData = data.loaderData as Record<string, unknown> | undefined;
  if (!loaderData) return null;
  // 抖音 share page route key is something like "video_(id)/page" — search for a page object with videoInfoRes.
  const page = Object.values(loaderData).find(
    (value): value is Record<string, unknown> => Boolean(value && typeof value === "object" && (value as Record<string, unknown>).videoInfoRes),
  );
  if (!page) return null;
  const videoInfoRes = page.videoInfoRes as Record<string, unknown>;
  const list = (videoInfoRes.item_list as Array<Record<string, unknown>> | undefined) ?? [];
  const item = list[0] ?? (videoInfoRes.aweme_detail as Record<string, unknown> | undefined);
  if (!item) return null;
  return readItem(item, data);
}

function readItem(item: Record<string, unknown>, raw: Record<string, unknown>): ItemInfoResult {
  const author = item.author as Record<string, unknown> | undefined;
  const video = item.video as Record<string, unknown> | undefined;
  const cover = video?.cover as Record<string, unknown> | undefined;
  const playAddrObj = (video?.play_addr ??
    video?.play_addr_h264 ??
    video?.play_addr_lowbr) as Record<string, unknown> | undefined;
  const textExtra = (item.text_extra ?? item.textExtra) as Array<Record<string, unknown>> | undefined;
  const urlList = (playAddrObj?.url_list as string[] | undefined) ?? [];
  const playAddr = urlList[0] ?? null;
  const coverList = (cover?.url_list as string[] | undefined) ?? [];
  const music = item.music as Record<string, unknown> | undefined;
  const statistics = item.statistics as Record<string, number> | undefined;

  return {
    desc: String(item.desc ?? item.description ?? ""),
    author: String(author?.nickname ?? author?.unique_id ?? ""),
    cover: coverList[0] ?? null,
    playAddr,
    durationMs: typeof video?.duration === "number" ? (video.duration as number) : null,
    tags: (textExtra ?? [])
      .map((entry) => String(entry.hashtag_name ?? entry.hashtagName ?? "").trim())
      .filter(Boolean),
    music: String(music?.title ?? ""),
    statistics: statistics ?? null,
    raw,
  };
}

async function tryExternalParser(url: string): Promise<Partial<ParsedDouyin> | null> {
  if (!config.douyinParserBaseUrl) return null;
  const base = config.douyinParserBaseUrl.replace(/\/$/, "");
  const candidates = [`${base}/parse?url=${encodeURIComponent(url)}`, `${base}/api?url=${encodeURIComponent(url)}`, `${base}?url=${encodeURIComponent(url)}`];

  for (const endpoint of candidates) {
    try {
      const response = await fetch(endpoint, { headers: { accept: "application/json" } });
      if (!response.ok) continue;
      const data = (await response.json()) as Record<string, unknown>;
      const item = (data.data ?? data.aweme_detail ?? data) as Record<string, unknown>;
      const title = String(item.title ?? item.desc ?? item.description ?? "");
      if (!title) continue;
      const video = item.video as Record<string, unknown> | undefined;
      const playAddrObj = video?.play_addr as Record<string, unknown> | undefined;
      const playAddr =
        String(item.play_url ?? item.play_addr ?? "") ||
        (Array.isArray(playAddrObj?.url_list) ? String(playAddrObj.url_list[0] ?? "") : "");
      return {
        title,
        description: String(item.description ?? item.desc ?? title),
        author: String((item.author as Record<string, unknown> | undefined)?.nickname ?? item.author ?? ""),
        coverUrl: String(item.cover_url ?? item.cover ?? item.dynamic_cover ?? "") || null,
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        asrText: String(item.subtitle ?? item.asr_text ?? ""),
        playAddr: playAddr || null,
        durationMs: typeof item.duration === "number" ? (item.duration as number) : null,
        rawMetadata: data,
      };
    } catch {
      // Try the next common endpoint shape.
    }
  }
  return null;
}

export async function parseDouyinUrl(originalUrl: string, shareText = ""): Promise<ParsedDouyin> {
  const { finalUrl, html } = await followUrl(originalUrl);
  const normalizedUrl = finalUrl || originalUrl;
  const videoId = extractVideoId(normalizedUrl) ?? extractVideoId(originalUrl);

  const routerData = tryRouterData(html);
  const external = await tryExternalParser(finalUrl).catch(() => null);

  const metaTitle = getMeta(html, "og:title") || decodeHtml(html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] ?? "");
  const metaDescription = getMeta(html, "description") || getMeta(html, "og:description");
  const metaCover = getMeta(html, "og:image") || null;

  const description =
    routerData?.desc ||
    external?.description ||
    metaDescription ||
    shareText.slice(0, 220);
  const title = (external?.title || metaTitle || description.slice(0, 40)).trim();
  const coverUrl = routerData?.cover || external?.coverUrl || metaCover;
  const author = routerData?.author || external?.author || "";
  const tags = (routerData?.tags?.length ? routerData.tags : external?.tags) ?? [];
  const playAddr = routerData?.playAddr || external?.playAddr || null;
  const durationMs = routerData?.durationMs ?? external?.durationMs ?? null;

  if (!title && !description) {
    throw new Error("这条链接暂时读不到内容，请换一条公开分享链接。");
  }

  const sources: string[] = [];
  if (routerData) sources.push("router_data");
  if (external) sources.push("external_parser");
  if (!routerData && !external && (metaTitle || metaDescription)) sources.push("public_meta");

  return {
    originalUrl,
    normalizedUrl,
    videoId,
    title: title || "抖音分享视频",
    description: description || title,
    author,
    coverUrl,
    tags,
    asrText: external?.asrText || "",
    playAddr,
    durationMs,
    rawMetadata: {
      finalUrl,
      sources,
      htmlLength: html.length,
      hasPlayAddr: Boolean(playAddr),
      durationMs,
      music: routerData?.music,
      statistics: routerData?.statistics,
    },
  };
}
