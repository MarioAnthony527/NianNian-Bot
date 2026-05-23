import { NextRequest } from "next/server";
import { deleteCommitment, getCommitment, updateCommitmentStatus } from "@/lib/db";
import type { CommitmentStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/commitments/[id]">) {
  const { id } = await ctx.params;
  const token = request.nextUrl.searchParams.get("token") ?? undefined;
  const commitment = await getCommitment(id, token);
  if (!commitment) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ commitment });
}

export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/commitments/[id]">) {
  const { id } = await ctx.params;
  const body = (await request.json()) as { status?: CommitmentStatus };
  if (!body.status) return Response.json({ error: "missing status" }, { status: 400 });
  const commitment = await updateCommitmentStatus(id, body.status);
  return Response.json({ commitment });
}

export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/commitments/[id]">) {
  const { id } = await ctx.params;
  await deleteCommitment(id);
  return Response.json({ ok: true });
}
