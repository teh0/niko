import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getOrchestratorQueue } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Finalize an intake session: create the Project using the collected
 * fields, link it back, kick off the orchestrator intake event. Returns
 * the new project id so the UI can redirect.
 *
 * Body (optional): { installationId?: string } — override/supply
 * the GitHub App installation id if the intake agent didn't capture it.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { installationId?: string };

  const session = await prisma.intakeSession.findUnique({ where: { id } });
  if (!session) return new Response("not found", { status: 404 });
  if (session.status === "FINALIZED" && session.projectId) {
    return Response.json({ projectId: session.projectId });
  }
  if (!session.name || !session.finalBrief || !session.githubOwner || !session.githubRepo) {
    return new Response("intake session missing required fields", { status: 400 });
  }

  const installationId =
    body.installationId?.trim() ||
    (session.installationId ? session.installationId.toString() : "");

  const project = await prisma.project.create({
    data: {
      name: session.name,
      brief: session.finalBrief,
      githubOwner: session.githubOwner,
      githubRepo: session.githubRepo,
      installationId: installationId ? BigInt(installationId) : null,
      figmaUrl: session.figmaUrl,
      status: "INTAKE",
    },
  });

  await prisma.intakeSession.update({
    where: { id },
    data: {
      status: "FINALIZED",
      projectId: project.id,
      installationId: installationId ? BigInt(installationId) : null,
    },
  });

  await getOrchestratorQueue().add("gate-event", {
    projectId: project.id,
    event: "INTAKE",
  });

  return Response.json({ projectId: project.id });
}
