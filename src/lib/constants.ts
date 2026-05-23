import { Archive } from "lucide-react";

export const STATUS_META = {
  pending: { label: "等待兑现", color: "bg-amber-50 text-amber-900 border-amber-200" },
  fulfilled: { label: "已兑现", color: "bg-emerald-50 text-emerald-900 border-emerald-200" },
  abandoned: { label: "放下的", color: "bg-zinc-50 text-zinc-700 border-zinc-200" },
  archived: { label: "已归档", color: "bg-slate-50 text-slate-700 border-slate-200" },
  failed: { label: "处理失败", color: "bg-red-50 text-red-900 border-red-200" },
} as const;

export const DEFAULT_FOLDER = "默认";
export const DEFAULT_PUSH_HOUR = 9;
export const APP_NAME = "念念";
export const ArchiveIcon = Archive;
