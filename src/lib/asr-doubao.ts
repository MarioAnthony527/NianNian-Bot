import { config } from "@/lib/config";

// Volcengine / 豆包 录音文件识别 2.0 极速版.
// Docs: https://www.volcengine.com/docs/6561/1631584
const DOUBAO_ENDPOINT = "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";
const DOUBAO_RESOURCE_ID = "volc.bigasr.auc_turbo";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, Math.min(i + chunk, bytes.length))),
    );
  }
  return globalThis.btoa(binary);
}

type DoubaoResponse = {
  code?: number;
  message?: string;
  result?: {
    text?: string;
    utterances?: Array<{ text?: string }>;
  };
  text?: string;
};

export async function transcribeWithDoubao(buffer: ArrayBuffer, format: "mp4" | "mp3" | "wav" | "ogg" = "mp4"): Promise<string> {
  if (!config.volcAppKey || !config.volcAccessKey) {
    throw new Error("Missing VOLC_APP_KEY or VOLC_ACCESS_KEY");
  }
  const base64 = arrayBufferToBase64(buffer);
  const requestId = `nian-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const response = await fetch(DOUBAO_ENDPOINT, {
    method: "POST",
    headers: {
      "X-Api-App-Key": config.volcAppKey,
      "X-Api-Access-Key": config.volcAccessKey,
      "X-Api-Resource-Id": DOUBAO_RESOURCE_ID,
      "X-Api-Request-Id": requestId,
      "X-Api-Sequence": "-1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user: { uid: config.volcAppKey },
      audio: {
        format,
        data: base64,
      },
      request: {
        model_name: "bigmodel",
      },
    }),
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`Doubao HTTP ${response.status}: ${bodyText.slice(0, 400)}`);
  }
  let data: DoubaoResponse;
  try {
    data = JSON.parse(bodyText) as DoubaoResponse;
  } catch {
    throw new Error(`Doubao non-JSON response: ${bodyText.slice(0, 300)}`);
  }
  if (typeof data.code === "number" && data.code !== 0 && data.code !== 20000000) {
    throw new Error(`Doubao code ${data.code}: ${data.message ?? "(no message)"}`);
  }
  const inline = data.result?.text ?? data.text ?? "";
  if (inline) return inline.trim();
  const utterances = data.result?.utterances?.map((u) => u.text ?? "").filter(Boolean) ?? [];
  return utterances.join("").trim();
}
