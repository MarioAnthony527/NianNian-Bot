import { addDays, formatDistanceToNowStrict, set } from "date-fns";
import { zhCN } from "date-fns/locale";
import { DEFAULT_PUSH_HOUR } from "@/lib/constants";

export function nextDefaultPushTime() {
  const now = new Date();
  const tomorrow = addDays(now, 1);
  return set(tomorrow, {
    hours: DEFAULT_PUSH_HOUR,
    minutes: 0,
    seconds: 0,
    milliseconds: 0,
  });
}

export function daysFromNow(days: number) {
  return addDays(new Date(), days);
}

export function relativeTime(date: string | null | undefined) {
  if (!date) return "未知时间";
  return formatDistanceToNowStrict(new Date(date), { addSuffix: true, locale: zhCN });
}

export function weekdayName(date = new Date()) {
  return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()];
}
