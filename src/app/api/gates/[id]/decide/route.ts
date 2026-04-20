import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { enqueueNext } from "@/lib/orchestrator/flow";
import { mergePR } from "@/lib/github/prs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Manual gate decision endpoint — the dashboard button calls this so you can
 * approve/reject gates locally without needing a public webhook endpoint for
 * GitHub. In production the same updates come from the GitHub webhook.
 *
 * Body: { decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED", feedback?: string }
 *
 * On APPROVED: auto-merge the linked PR so the next agent works against an
 * up-to-date main. Without this, each agent clones main which still only has
 * the bootstrap commit → produces bad output → flow loops.
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

  const gate = await prisma.gate.findUnique({
    where: { id },
    include: { project: true },
  });
  if (!gate) return new Response("not found", { status: 404 });
  if (gate.status !== "PENDING") {
    return new Response("gate already decided", { status: 409 });
  }

  // If APPROVED and the gate has a linked PR: merge it before the flow
  // advances, so the next agent sees the changes on main.
  if (body.decision === "APPROVED" && gate.prNumber) {
    try {
      const merged = await mergePR(
        { owner: gate.project.githubOwner, repo: gate.project.githubRepo },
        gate.project.installationId,
        gate.prNumber,
      );
      if (merged) {
        await prisma.pullRequest.updateMany({
          where: { projectId: gate.projectId, number: gate.prNumber },
          data: { state: "closed", merged: true },
        });
      }
    } catch (err) {
      // Surface the error but don't block the decision; the human can
      // merge manually on GitHub if needed.
      console.error(`[gate ${id}] failed to auto-merge PR #${gate.prNumber}:`, err);
      return new Response(
        `Gate approved but auto-merge failed: ${err instanceof Error ? err.message : String(err)}. ` +
          `Merge PR #${gate.prNumber} manually on GitHub, then the flow will continue.`,
        { status: 500 },
      );
    }
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
