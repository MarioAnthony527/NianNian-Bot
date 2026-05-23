import { DEFAULT_FOLDER, FOLDERS } from "@/lib/constants";

export function normalizeFolderName(value: string | null | undefined) {
  const cleaned = (value ?? "")
    .replace(/[#[\]【】"'“”‘’<>]/g, "")
    .replace(/\s+/g, "")
    .trim()
    .slice(0, 12);
  return cleaned || DEFAULT_FOLDER;
}

export function extractFolderDirective(text: string) {
  const explicit = text.match(/(?:文件夹|分类|收藏夹)\s*[:：]\s*([^\s,，。#]{1,12})/);
  if (explicit?.[1]) {
    return normalizeFolderName(explicit[1]);
  }

  const leadingHash = text.match(/(?:^|\s)#([\p{L}\p{N}_\-\u4e00-\u9fff]{1,12})(?=\s|$)/u);
  if (leadingHash?.[1]) {
    return normalizeFolderName(leadingHash[1]);
  }

  return null;
}

export function folderMeta(folder: string) {
  return FOLDERS.find((item) => item.key === folder) ?? {
    key: folder,
    emoji: "📁",
    color: "bg-white text-zinc-800 border-zinc-200",
  };
}

export function defaultFolderNames() {
  return FOLDERS.map((item) => item.key);
}
