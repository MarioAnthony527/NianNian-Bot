function base64ToBytes(value: string) {
  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}

async function sha256(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return new Uint8Array(hash);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return new Uint8Array(bytes).buffer as ArrayBuffer;
}

export async function decryptFeishuPayload(encryptBase64: string, encryptKey: string) {
  const keyBytes = await sha256(new TextEncoder().encode(encryptKey));
  const cipherBytes = base64ToBytes(encryptBase64);
  if (cipherBytes.length < 16) throw new Error("Feishu encrypt payload too short");

  const iv = cipherBytes.slice(0, 16);
  const data = cipherBytes.slice(16);
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(keyBytes),
    { name: "AES-CBC" },
    false,
    ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-CBC", iv: toArrayBuffer(iv) },
    key,
    toArrayBuffer(data),
  );
  const text = new TextDecoder().decode(plain).replace(/\0+$/, "");
  return JSON.parse(text) as Record<string, unknown>;
}
