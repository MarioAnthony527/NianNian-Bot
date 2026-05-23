import { config } from "@/lib/config";
import { transcribeWithDoubao } from "@/lib/asr-doubao";

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

export type TranscribeResult = {
  text: string;
  bytesDownloaded: number;
  truncated: boolean;
  source: "whisper" | "doubao" | "skipped";
  skipReason?: string;
};

async function fetchClip(url: string, maxBytes: number): Promise<{ buffer: ArrayBuffer; truncated: boolean } | null> {
  // Try a Range request first so long videos don't blow the function timeout.
  const headers: Record<string, string> = {
    "user-agent": MOBILE_UA,
    accept: "video/mp4,video/*;q=0.9,*/*;q=0.5",
    referer: "https://www.douyin.com/",
    range: `bytes=0-${Math.max(0, maxBytes - 1)}`,
  };

  let response = await fetch(url, { headers, redirect: "follow" });

  // Some CDNs ignore Range and return 200 with full body; that's fine, we'll truncate ourselves.
  if (!response.ok && response.status !== 206) {
    // Retry without Range — a few抖音 CDN nodes 403 on Range from non-app UA.
    const fallbackHeaders = { ...headers };
    delete fallbackHeaders.range;
    response = await fetch(url, { headers: fallbackHeaders, redirect: "follow" });
    if (!response.ok) return null;
  }

  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    if (total + value.length > maxBytes) {
      chunks.push(value.slice(0, maxBytes - total));
      total = maxBytes;
      truncated = true;
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      break;
    }
    chunks.push(value);
    total += value.length;
  }
  // Drain any leftover to detect "truncated" accurately, then stop.
  if (!truncated) {
    const { done } = await reader.read();
    if (!done) truncated = true;
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return { buffer: merged.buffer, truncated };
}

async function whisperTranscribe(buffer: ArrayBuffer): Promise<string | null> {
  if (!config.llmApiKey) return null;
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "video/mp4" }), "clip.mp4");
  form.append("model", config.asrModel);
  form.append("language", "zh");
  form.append("response_format", "json");

  const response = await fetch(`${config.llmApiBase.replace(/\/$/, "")}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.llmApiKey}` },
    body: form,
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`ASR HTTP ${response.status}: ${body.slice(0, 200)}`);
  }
  const data = (await response.json().catch(() => null)) as { text?: string } | null;
  return data?.text?.trim() ?? null;
}

export async function transcribeClip(playAddr: string | null | undefined): Promise<TranscribeResult> {
  if (!config.enableAsr) {
    return { text: "", bytesDownloaded: 0, truncated: false, source: "skipped", skipReason: "ASR disabled" };
  }
  if (!playAddr) {
    return { text: "", bytesDownloaded: 0, truncated: false, source: "skipped", skipReason: "no play URL" };
  }
  const clip = await fetchClip(playAddr, Math.max(500_000, config.asrClipBytes)).catch((error) => {
    console.warn("ASR fetch failed", error);
    return null;
  });
  if (!clip || clip.buffer.byteLength < 50_000) {
    return {
      text: "",
      bytesDownloaded: clip?.buffer.byteLength ?? 0,
      truncated: clip?.truncated ?? false,
      source: "skipped",
      skipReason: "clip too small or download failed",
    };
  }
  const provider = config.asrProvider;
  try {
    const text =
      provider === "doubao"
        ? await transcribeWithDoubao(clip.buffer, "mp4")
        : (await whisperTranscribe(clip.buffer)) ?? "";
    return {
      text: text ?? "",
      bytesDownloaded: clip.buffer.byteLength,
      truncated: clip.truncated,
      source: provider,
    };
  } catch (error) {
    return {
      text: "",
      bytesDownloaded: clip.buffer.byteLength,
      truncated: clip.truncated,
      source: "skipped",
      skipReason: error instanceof Error ? error.message : `${provider} failed`,
    };
  }
}
