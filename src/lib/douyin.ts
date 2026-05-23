import type { ParsedDouyin } from "@/lib/types";
import { config } from "@/lib/config";

const URL_PATTERN = /https?:\/\/[^\s"'<>）)，。]+/g;

export function extractUrls(text: string) {
  return Array.from(text.matchAll(URL_PATTERN))
    .map((match) => match[0].replace(/[.,，。)）\]]+$/, ""))
    .filter((url) => url.includes("douyin.com") || url.includes("iesdouyin.com"));
}

function extractVideoId(url: string) {
  const patterns = [/\/video\/(\d+)/, /modal_id=(\d+)/, /aweme_id=(\d+)/, /item_ids=(\d+)/];
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
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      accept: "text/html,application/xhtml+xml",
    },
  });
  return { finalUrl: response.url || url, html: await response.text().catch(() => "") };
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
      return {
        title,
        description: String(item.description ?? item.desc ?? title),
        author: String((item.author as Record<string, unknown> | undefined)?.nickname ?? item.author ?? ""),
        coverUrl: String(item.cover_url ?? item.cover ?? item.dynamic_cover ?? "") || null,
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        asrText: String(item.subtitle ?? item.asr_text ?? ""),
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
  const external = await tryExternalParser(finalUrl);
  const normalizedUrl = finalUrl || originalUrl;
  const videoId = extractVideoId(normalizedUrl) ?? extractVideoId(originalUrl);

  const title =
    external?.title ||
    getMeta(html, "og:title") ||
    decodeHtml(html.match(/<title[^>]*>(.*?)<\/title>/i)?.[1] ?? "");
  const description =
    external?.description ||
    getMeta(html, "description") ||
    getMeta(html, "og:description") ||
    shareText.slice(0, 220);
  const coverUrl = external?.coverUrl || getMeta(html, "og:image") || null;
  const author = external?.author || "";

  if (!title && !description) {
    throw new Error("这条链接暂时读不到内容，请换一条公开分享链接。");
  }

  return {
    originalUrl,
    normalizedUrl,
    videoId,
    title: title || "抖音分享视频",
    description: description || title,
    author,
    coverUrl,
    tags: external?.tags ?? [],
    asrText: external?.asrText || description || shareText,
    rawMetadata: {
      finalUrl,
      title,
      description,
      coverUrl,
      author,
      source: external ? "external_parser" : "public_meta",
    },
  };
}
