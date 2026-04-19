import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueNext } from "@/lib/orchestrator/flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manual gate decision endpoint — the dashboard button calls this so you can
 * approve/reject gates locally without needing a public webhook endpoint for
 * GitHub. In production the same updates come from the GitHub webhook.
 *
 * Body: { decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED", feedback?: string }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    decision?: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
    feedback?: string;
  };

  if (!body.decision || !["APPROVED", "CHANGES_REQUESTED", "REJECTED"].includes(body.decision)) {
    return new Response("invalid decision", { status: 400 });
  }

  const gate = await prisma.gate.findUnique({ where: { id } });
  if (!gate) return new Response("not found", { status: 404 });
  if (gate.status !== "PENDING") {
    return new Response("gate already decided", { status: 409 });
  }

  await prisma.gate.update({
    where: { id },
    data: {
      status: "DECIDED",
      decision: body.decision,
      feedback: body.feedback ?? null,
      decidedAt: new Date(),
      decidedBy: "dashboard",
    },
  });

  await enqueueNext({ id: gate.projectId });

  return Response.json({ ok: true });
}
