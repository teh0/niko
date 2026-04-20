import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getAgentsQueue } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Retry a failed agent run by creating a fresh AgentRun with the same
 * inputs and enqueuing it. We don't reuse the old row — keeping it lets
 * the user see the failure history.
 */
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const prev = await prisma.agentRun.findUnique({ where: { id } });
  if (!prev) return new Response("not found", { status: 404 });
  if (prev.status !== "FAILED") {
    return new Response("only failed runs can be retried", { status: 409 });
  }
  if (prev.role === "INTAKE") {
    return new Response("intake runs are not queued", { status: 400 });
  }

  const fresh = await prisma.agentRun.create({
    data: {
      projectId: prev.projectId,
      ticketId: prev.ticketId,
      role: prev.role,
      task: prev.task,
      input: prev.input as never,
      status: "QUEUED",
    },
  });

  await getAgentsQueue().add(
    "run",
    {
      runId: fresh.id,
      projectId: fresh.projectId,
      role: fresh.role as Exclude<typeof fresh.role, "INTAKE">,
      task: fresh.task,
      input: (fresh.input as Record<string, unknown>) ?? {},
      ticketId: fresh.ticketId ?? undefined,
    },
    { attempts: 3, backoff: { type: "exponential", delay: 30_000 } },
  );

  return Response.json({ runId: fresh.id });
}
