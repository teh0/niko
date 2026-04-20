import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueNext } from "@/lib/orchestrator/flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Kick the flow forward. Re-runs decideNext() for the project and
 * enqueues whatever agent should act next. Safe to call when stuck —
 * if there's already work in flight it's a no-op, otherwise it creates
 * a fresh run for the pending step.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return new Response("not found", { status: 404 });

  await enqueueNext({ id });
  return Response.json({ ok: true });
}
