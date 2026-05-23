import {
  Archive,
  BookOpen,
  BriefcaseBusiness,
  Dumbbell,
  HeartHandshake,
  Inbox,
  Package,
  Soup,
} from "lucide-react";

export const FOLDERS = [
  { key: "全部", emoji: "🗂️", color: "bg-zinc-50 text-zinc-900 border-zinc-200", icon: Inbox },
  { key: "美食", emoji: "🍳", color: "bg-emerald-50 text-emerald-900 border-emerald-200", icon: Soup },
  { key: "身体", emoji: "💪", color: "bg-sky-50 text-sky-900 border-sky-200", icon: Dumbbell },
  { key: "工作", emoji: "👔", color: "bg-slate-50 text-slate-900 border-slate-200", icon: BriefcaseBusiness },
  { key: "知识", emoji: "🧠", color: "bg-indigo-50 text-indigo-900 border-indigo-200", icon: BookOpen },
  { key: "关系", emoji: "💖", color: "bg-rose-50 text-rose-900 border-rose-200", icon: HeartHandshake },
  { key: "杂物", emoji: "📦", color: "bg-stone-50 text-stone-900 border-stone-200", icon: Package },
] as const;

export const STATUS_META = {
  pending: { label: "等待兑现", color: "bg-amber-50 text-amber-900 border-amber-200" },
  fulfilled: { label: "已兑现", color: "bg-emerald-50 text-emerald-900 border-emerald-200" },
  abandoned: { label: "放下的", color: "bg-zinc-50 text-zinc-700 border-zinc-200" },
  archived: { label: "已归档", color: "bg-slate-50 text-slate-700 border-slate-200" },
  failed: { label: "处理失败", color: "bg-red-50 text-red-900 border-red-200" },
} as const;

export const DEFAULT_FOLDER = "全部";
export const DEFAULT_PUSH_HOUR = 9;
export const APP_NAME = "念念";
export const ArchiveIcon = Archive;
