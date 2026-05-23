"use client";

import { Send } from "lucide-react";
import { useState } from "react";

export function DemoPushButton({ commitmentId }: { commitmentId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function push() {
    setState("loading");
    try {
      const secret = window.prompt("输入 DEMO_SECRET", "demo-local");
      const response = await fetch("/api/reminders/push-now", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commitmentId, secret }),
      });
      if (!response.ok) throw new Error(await response.text());
      setState("done");
    } catch {
      setState("error");
    }
  }

  return (
    <button
      type="button"
      onClick={push}
      disabled={state === "loading"}
      className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-3 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
    >
      <Send className="h-4 w-4" />
      {state === "loading" ? "推送中" : state === "done" ? "已推送" : state === "error" ? "失败" : "立刻推送"}
    </button>
  );
}
