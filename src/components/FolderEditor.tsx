"use client";

import { Folder, Loader2, Save } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type FolderEditorProps = {
  commitmentId: string;
  currentFolder: string;
  folders: string[];
};

export function FolderEditor({ commitmentId, currentFolder, folders }: FolderEditorProps) {
  const router = useRouter();
  const [folder, setFolder] = useState(currentFolder);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const options = useMemo(
    () => Array.from(new Set([currentFolder, ...folders].filter(Boolean))),
    [currentFolder, folders],
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextFolder = folder.trim();
    if (!nextFolder) return;

    setState("saving");
    try {
      const response = await fetch(`/api/commitments/${commitmentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folder: nextFolder }),
      });
      if (!response.ok) throw new Error(await response.text());
      setState("saved");
      router.refresh();
    } catch {
      setState("error");
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <label className="min-w-0 flex-1">
        <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <Folder className="h-4 w-4" />
          收藏夹
        </span>
        <input
          value={folder}
          onChange={(event) => {
            setFolder(event.target.value);
            setState("idle");
          }}
          list="folder-options"
          maxLength={12}
          className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-zinc-400"
          placeholder="输入新名字，或选择已有收藏夹"
        />
        <datalist id="folder-options">
          {options.map((item) => (
            <option key={item} value={item} />
          ))}
        </datalist>
      </label>
      <button
        type="submit"
        disabled={state === "saving" || !folder.trim()}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-zinc-900 px-4 text-sm font-medium text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
      >
        {state === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {state === "saving" ? "保存中" : state === "saved" ? "已保存" : "保存"}
      </button>
      {state === "error" ? <p className="text-sm text-red-600 sm:pb-2">保存失败</p> : null}
    </form>
  );
}
