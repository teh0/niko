/**
 * Orchestrator worker — reacts to external events (GitHub reviews, merges,
 * project intake) and decides the next agent to run.
 */

import { Worker } from "bullmq";
import { QUEUE_NAMES, connection, type OrchestratorJobData } from "../queue";
import { prisma } from "../db";
import { enqueueNext } from "../orchestrator/flow";

export function startOrchestratorWorker() {
  return new Worker<OrchestratorJobData>(
    QUEUE_NAMES.ORCHESTRATOR,
    async (job) => {
      const { projectId, event, payload } = job.data;

      if (event === "INTAKE") {
        await enqueueNext({ id: projectId });
        return;
      }

      if (event === "PR_REVIEW" && payload) {
        const prNumber = payload.number as number;
        const state = payload.state as string; // "approved" | "changes_requested" | "commented"
        const feedback = (payload.body as string) || "";

        // Find the gate tied to this PR.
        const gate = await prisma.gate.findFirst({
          where: { projectId, prNumber, status: "PENDING" },
        });
        if (!gate) return;

        const decision =
          state === "approved"
            ? "APPROVED"
            : state === "changes_requested"
              ? "CHANGES_REQUESTED"
              : null;

        if (!decision) return; // plain comment, ignore

        await prisma.gate.update({
          where: { id: gate.id },
          data: {
            status: "DECIDED",
            decision,
            feedback,
            decidedAt: new Date(),
            decidedBy: (payload.reviewer as string) ?? null,
          },
        });

        await enqueueNext({ id: projectId });
      }

      if (event === "PR_MERGED" && payload) {
        const prNumber = payload.number as number;

        // If this PR was tied to a ticket, mark it done.
        await prisma.ticket.updateMany({
          where: { projectId, prNumber },
          data: { status: "DONE" },
        });

        await enqueueNext({ id: projectId });
      }
    },
    { connection, concurrency: 4 },
  );
}
