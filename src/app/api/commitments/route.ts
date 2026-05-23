import { NextRequest } from "next/server";
import { listCommitments } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  const commitments = await listCommitments({
    token: search.get("token") ?? undefined,
    status: search.get("status") ?? undefined,
  });
  return Response.json({ commitments });
}
