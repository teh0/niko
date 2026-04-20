import { NextRequest } from "next/server";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Delete a project. Cascades through Prisma relations (gates, tickets,
 * runs, messages, PRs, intake session). Also wipes the project's local
 * git clone in WORKSPACE_DIR so a subsequent project can reuse the
 * name without contamination. Does NOT touch the GitHub repo itself.
 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return new Response("not found", { status: 404 });

  // IntakeSession → Project is SetNull (the session predates the project
  // by schema design, so it survives a project deletion with projectId
  // nulled). For a UI 'delete everything' intent, nuke the linked intake
  // session + its messages too. Everything else cascades from Project.
  await prisma.intakeSession.deleteMany({ where: { projectId: id } });

  await prisma.project.delete({ where: { id } });

  // Wipe local workspace. Ignore failure — the DB deletion already
  // succeeded; the workspace is just scratch space.
  const wsPath = join(env.WORKSPACE_DIR, id);
  await rm(wsPath, { recursive: true, force: true }).catch(() => undefined);

  return Response.json({ ok: true });
}
