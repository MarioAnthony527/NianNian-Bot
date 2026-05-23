#!/usr/bin/env node
/* eslint-disable */
// Diagnose a douyin link end-to-end without booting Next.js.
//
// Usage:
//   node scripts/check-parse.mjs "<url>" ["<url2>" ...]
//
// Optional env (mirrors the app):
//   ENABLE_ASR=true LLM_API_BASE=... LLM_API_KEY=... ASR_MODEL=whisper-1
//   ASR_CLIP_BYTES=3000000  # max bytes of video to feed Whisper
//
// Prints what each parsing layer would produce, including a Whisper transcript
// of the first slice of audio if credentials are present.

import process from "node:process";
import fs from "node:fs";
import path from "node:path";

// Try to load .env.local then .env so the script picks up the same vars Next reads.
function loadDotenv() {
  const candidates = [".env.local", ".env"].map((file) => path.resolve(process.cwd(), file));
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/);
      if (!match) continue;
      const [, key, val] = match;
      if (process.env[key] !== undefined) continue;
      let value = val;
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}
loadDotenv();

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

const LLM_API_BASE = (process.env.LLM_API_BASE ?? "https://api.openai.com/v1").replace(/\/$/, "");
const LLM_API_KEY = process.env.LLM_API_KEY ?? "";
const ASR_MODEL = process.env.ASR_MODEL ?? "whisper-1";
const ASR_CLIP_BYTES = Number(process.env.ASR_CLIP_BYTES ?? "3000000");
const ENABLE_ASR = (process.env.ENABLE_ASR ?? "true") !== "false";
const ASR_PROVIDER = (process.env.ASR_PROVIDER ?? "whisper").toLowerCase();
const VOLC_APP_KEY = process.env.VOLC_APP_KEY ?? "";
const VOLC_ACCESS_KEY = process.env.VOLC_ACCESS_KEY ?? "";

const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const ok = (s) => `\x1b[32m${s}\x1b[0m`;
const warn = (s) => `\x1b[33m${s}\x1b[0m`;
const fail = (s) => `\x1b[31m${s}\x1b[0m`;

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .trim();
}

function getMeta(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

function extractVideoId(url) {
  const patterns = [/\/video\/(\d+)/, /modal_id=(\d+)/, /aweme_id=(\d+)/, /item_ids=(\d+)/, /\/share\/video\/(\d+)/];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

async function followUrl(url) {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": MOBILE_UA,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "zh-CN,zh;q=0.9",
    },
  });
  return { status: response.status, finalUrl: response.url || url, html: await response.text().catch(() => "") };
}

async function tryRouterData(html) {
  const match = html.match(/window\._ROUTER_DATA\s*=\s*([\s\S]*?)<\/script>/);
  if (!match) return null;
  const raw = match[1].trim().replace(/;\s*$/, "");
  let data;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    console.log(dim(`  _ROUTER_DATA parse failed: ${error.message}`));
    return null;
  }
  const loaderData = data.loaderData ?? {};
  const page = Object.values(loaderData).find((v) => v && typeof v === "object" && v.videoInfoRes);
  if (!page) {
    console.log(dim(`  _ROUTER_DATA found but no videoInfoRes (keys: ${Object.keys(loaderData).join(",")})`));
    return null;
  }
  const item = page.videoInfoRes.item_list?.[0] ?? page.videoInfoRes.aweme_detail;
  if (!item) return null;
  const video = item.video ?? {};
  const playAddr =
    video.play_addr?.url_list?.[0] ??
    video.play_addr_h264?.url_list?.[0] ??
    video.play_addr_lowbr?.url_list?.[0] ??
    null;
  return {
    desc: item.desc ?? "",
    author: item.author?.nickname ?? item.author?.unique_id ?? "",
    cover: video.cover?.url_list?.[0] ?? null,
    playAddr,
    durationMs: typeof video.duration === "number" ? video.duration : null,
    tags: (item.text_extra ?? []).map((t) => t.hashtag_name).filter(Boolean),
    music: item.music?.title ?? "",
    statistics: item.statistics ?? null,
  };
}

async function fetchClip(playAddr, maxBytes) {
  const headers = {
    "user-agent": MOBILE_UA,
    accept: "video/mp4,video/*;q=0.9,*/*;q=0.5",
    referer: "https://www.douyin.com/",
    range: `bytes=0-${Math.max(0, maxBytes - 1)}`,
  };
  let response = await fetch(playAddr, { headers, redirect: "follow" });
  if (!response.ok && response.status !== 206) {
    const fb = { ...headers };
    delete fb.range;
    response = await fetch(playAddr, { headers: fb, redirect: "follow" });
    if (!response.ok) return { status: response.status, bytes: 0, truncated: false, buffer: null };
  }
  const reader = response.body?.getReader();
  if (!reader) return { status: response.status, bytes: 0, truncated: false, buffer: null };
  const chunks = [];
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
      try { await reader.cancel(); } catch {}
      break;
    }
    chunks.push(value);
    total += value.length;
  }
  if (!truncated) {
    const { done } = await reader.read();
    if (!done) truncated = true;
    try { await reader.cancel(); } catch {}
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return { status: response.status, bytes: total, truncated, buffer: merged.buffer };
}

async function whisperTranscribe(buffer) {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "video/mp4" }), "clip.mp4");
  form.append("model", ASR_MODEL);
  form.append("language", "zh");
  form.append("response_format", "json");
  const response = await fetch(`${LLM_API_BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${LLM_API_KEY}` },
    body: form,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${text.slice(0, 300)}`);
  let data;
  try { data = JSON.parse(text); } catch { return text; }
  return data?.text ?? "";
}

function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, Math.min(i + chunk, bytes.length))));
  }
  return Buffer.from(binary, "binary").toString("base64");
}

async function doubaoTranscribe(buffer) {
  if (!VOLC_APP_KEY || !VOLC_ACCESS_KEY) throw new Error("VOLC_APP_KEY / VOLC_ACCESS_KEY not set");
  const base64 = bufferToBase64(buffer);
  // Try every plausible resource_id; the first that isn't 403 wins.
  const candidates = [
    "volc.bigasr.auc_turbo", // 极速版
    "volc.bigasr.sauc.duration", // 录音文件识别2.0 按时长
    "volc.bigasr.sauc.concurrent", // 录音文件识别2.0 按并发
    "volc.bigasr.auc", // 标准版（异步）
  ];
  const errors = [];
  for (const resourceId of candidates) {
    const requestId = `nian-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const response = await fetch("https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash", {
      method: "POST",
      headers: {
        "X-Api-App-Key": VOLC_APP_KEY,
        "X-Api-Access-Key": VOLC_ACCESS_KEY,
        "X-Api-Resource-Id": resourceId,
        "X-Api-Request-Id": requestId,
        "X-Api-Sequence": "-1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user: { uid: VOLC_APP_KEY },
        audio: { format: "mp4", data: base64 },
        request: { model_name: "bigmodel" },
      }),
    });
    const body = await response.text();
    console.log(dim(`  try ${resourceId} -> HTTP ${response.status}`));
    if (response.status === 403) {
      errors.push(`${resourceId}: 403 ${body.slice(0, 120)}`);
      continue;
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 400)}`);
    }
    let data;
    try { data = JSON.parse(body); } catch { return body; }
    if (typeof data.code === "number" && data.code !== 0 && data.code !== 20000000) {
      throw new Error(`code ${data.code}: ${data.message ?? "(no message)"} | full=${body.slice(0,400)}`);
    }
    console.log(ok(`  ✓ resource granted: ${resourceId}`));
    const inline = data?.result?.text ?? data?.text;
    if (inline) return inline;
    const utterances = data?.result?.utterances?.map((u) => u.text).filter(Boolean) ?? [];
    return utterances.join("");
  }
  throw new Error(`all resource_ids forbidden:\n  ${errors.join("\n  ")}`);
}

async function diagnose(url) {
  console.log("\n=================================");
  console.log("Input URL:", url);

  // 1) Follow the share page so we have the canonical aweme id + og:meta fallbacks.
  const { status, finalUrl, html } = await followUrl(url);
  const awemeId = extractVideoId(finalUrl) ?? extractVideoId(url);
  console.log(`Share page -> ${status} ${finalUrl}  ${dim(`(html ${html.length}b, aweme_id ${awemeId ?? "?"})`)}`);

  const metaTitle = getMeta(html, "og:title");
  const metaDesc = getMeta(html, "og:description");
  console.log("og:title       :", metaTitle || fail("(empty)"));
  console.log("og:description :", metaDesc || fail("(empty)"));

  // 2) Inline _ROUTER_DATA from the share page — that's where play_addr lives now.
  console.log("\n--- _ROUTER_DATA ---");
  const info = await tryRouterData(html);
  if (!info) {
    console.log(fail("✗ _ROUTER_DATA not found in share HTML"));
    console.log("    (will fall back to og:meta only — no ASR possible)");
    return;
  }
  console.log(ok("✓ extracted"));
  console.log("desc       :", info.desc || dim("(empty)"));
  console.log("author     :", info.author || dim("(empty)"));
  console.log("tags       :", info.tags.join(", ") || dim("(none)"));
  console.log("duration   :", info.durationMs ? `${info.durationMs} ms (${(info.durationMs/1000).toFixed(1)}s)` : dim("(unknown)"));
  console.log("music      :", info.music || dim("(none)"));
  console.log("stats      :", info.statistics ? `digg=${info.statistics.digg_count} comment=${info.statistics.comment_count} share=${info.statistics.share_count}` : dim("(none)"));
  console.log("playAddr   :", info.playAddr ? ok(info.playAddr.slice(0, 90) + "...") : fail("(missing)"));

  if (!info.playAddr) {
    console.log(fail("\n✗ no play URL -> can't fetch audio"));
    return;
  }

  // 3) Try a Range-limited download so we keep within the Vercel budget.
  console.log("\n--- audio clip download ---");
  const clip = await fetchClip(info.playAddr, ASR_CLIP_BYTES);
  if (!clip.buffer || clip.bytes < 50_000) {
    console.log(fail(`✗ clip fetch failed/too small (status ${clip.status}, ${clip.bytes}b)`));
    return;
  }
  console.log(ok(`✓ got ${clip.bytes.toLocaleString()} bytes (truncated=${clip.truncated})`));

  // 4) ASR.
  if (!ENABLE_ASR) {
    console.log(dim("\n--- ASR ---\nENABLE_ASR=false, skipping transcription"));
    return;
  }
  console.log(`\n--- ASR (provider=${ASR_PROVIDER}) ---`);
  try {
    const t0 = Date.now();
    let text;
    if (ASR_PROVIDER === "doubao") {
      text = await doubaoTranscribe(clip.buffer);
    } else {
      if (!LLM_API_KEY) {
        console.log(warn("LLM_API_KEY not set, skipping Whisper"));
        return;
      }
      text = await whisperTranscribe(clip.buffer);
    }
    const dt = Date.now() - t0;
    console.log(ok(`✓ ${dt}ms`));
    console.log("transcript :", text || fail("(empty)"));
  } catch (error) {
    console.log(fail(`✗ ${error.message}`));
  }
}

const args = process.argv.slice(2);
if (!args.length) {
  console.error("usage: node scripts/check-parse.mjs <douyin url> [more urls...]");
  process.exit(1);
}

for (const url of args) {
  try {
    await diagnose(url);
  } catch (error) {
    console.error("Failed:", url, error);
  }
}
