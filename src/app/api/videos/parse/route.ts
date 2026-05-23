import { NextRequest } from "next/server";
import { parseDouyinUrl } from "@/lib/douyin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { url?: string; text?: string };
  if (!body.url) return Response.json({ error: "missing url" }, { status: 400 });
  const parsed = await parseDouyinUrl(body.url, body.text ?? "");
  return Response.json({ parsed });
}
