/**
 * Project state machine — decides what happens next after a gate event.
 *
 * The flow for a fresh project:
 *   INTAKE → PM writes specs → gate SPECS
 *     ↓ approved
 *   STACK_PLANNING → Tech Lead proposes stack → gate STACK_PLAN
 *     ↓ approved
 *   SCAFFOLDING → Tech Lead scaffolds repo → gate SCAFFOLD
 *     ↓ approved
 *   DB Expert designs data model → gate DATA_MODEL
 *     ↓ approved
 *   Tech Lead creates tickets → BUILDING
 *     ↓ devs open PRs → QA reviews → gate FEATURE_PR per PR
 *   All must-have tickets merged → gate QA_SIGNOFF → READY
 */

import type { GateKind, Project } from "@prisma/client";
import { prisma } from "../db";
import { getAgentsQueue } from "../queue";

export type NextAction =
  | {
      type: "run_agent";
      role: Exclude<import("@prisma/client").AgentRole, "INTAKE">;
      task: string;
      input: Record<string, unknown>;
    }
  | { type: "wait_for_gate"; kind: GateKind }
  | { type: "done" };

export async function decideNext(projectId: string): Promise<NextAction> {
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    // IMPORTANT: order gates newest-first so `find(kind === X)` always
    // returns the LATEST gate of that kind. Without this, the flow keeps
    // re-invoking the producing agent because it keeps looking at a stale
    // CHANGES_REQUESTED gate while newer PENDING ones sit ignored.
    include: {
      gates: { orderBy: { createdAt: "desc" } },
      tickets: true,
    },
  });

  const latestGate = (kind: import("@prisma/client").GateKind) =>
    project.gates.find((g) => g.kind === kind);

  const iterationOf = (kind: import("@prisma/client").GateKind) =>
    project.gates.filter((g) => g.kind === kind).length + 1;

  // 1. No specs yet → run PM.
  const specsGate = latestGate("SPECS");
  if (!specsGate) {
    return {
      type: "run_agent",
      role: "PM",
      task: "Turn this client brief into a product spec document and user stories.",
      input: { brief: project.brief, projectName: project.name },
    };
  }
  if (specsGate.status === "PENDING") return { type: "wait_for_gate", kind: "SPECS" };
  if (specsGate.decision !== "APPROVED") {
    return {
      type: "run_agent",
      role: "PM",
      task: `Revise spec (iteration ${iterationOf("SPECS")}) based on reviewer feedback.`,
      input: { brief: project.brief, feedback: specsGate.feedback },
    };
  }

  // 2. No stack plan → Tech Lead plans.
  const stackGate = latestGate("STACK_PLAN");
  if (!stackGate) {
    return {
      type: "run_agent",
      role: "TECH_LEAD",
      task: "Propose a stack plan ADR based on the approved specs.",
      input: { mode: "plan" },
    };
  }
  if (stackGate.status === "PENDING") return { type: "wait_for_gate", kind: "STACK_PLAN" };
  if (stackGate.decision !== "APPROVED") {
    return {
      type: "run_agent",
      role: "TECH_LEAD",
      task: `Revise stack plan (iteration ${iterationOf("STACK_PLAN")}) based on reviewer feedback.`,
      input: { mode: "plan", feedback: stackGate.feedback },
    };
  }

  // 3. No scaffold → Tech Lead scaffolds.
  const scaffoldGate = latestGate("SCAFFOLD");
  if (!scaffoldGate) {
    return {
      type: "run_agent",
      role: "TECH_LEAD",
      task: "Scaffold the repo according to the approved stack plan.",
      input: { mode: "scaffold" },
    };
  }
  if (scaffoldGate.status === "PENDING") return { type: "wait_for_gate", kind: "SCAFFOLD" };
  if (scaffoldGate.decision !== "APPROVED") {
    return {
      type: "run_agent",
      role: "TECH_LEAD",
      task: `Revise scaffold (iteration ${iterationOf("SCAFFOLD")}) based on reviewer feedback.`,
      input: { mode: "scaffold", feedback: scaffoldGate.feedback },
    };
  }

  // 4. No data model → DB Expert (only if stack includes a DB).
  const dataGate = latestGate("DATA_MODEL");
  const stackPlan = (project.stackPlan as { database?: { engine: string } } | null) ?? null;
  const needsDb = stackPlan?.database && stackPlan.database.engine !== "none";
  if (needsDb && !dataGate) {
    return {
      type: "run_agent",
      role: "DB_EXPERT",
      task: "Design the data model and create the baseline schema + migrations.",
      input: { mode: "design" },
    };
  }
  if (dataGate && dataGate.status === "PENDING") return { type: "wait_for_gate", kind: "DATA_MODEL" };
  if (dataGate && dataGate.decision && dataGate.decision !== "APPROVED") {
    return {
      type: "run_agent",
      role: "DB_EXPERT",
      task: `Revise data model (iteration ${iterationOf("DATA_MODEL")}) based on reviewer feedback.`,
      input: { mode: "design", feedback: dataGate.feedback },
    };
  }

  // 5. Break down tickets if none yet, then dispatch.
  if (project.tickets.length === 0) {
    return {
      type: "run_agent",
      role: "TECH_LEAD",
      task: "Break the specs into implementation tickets, one PR's worth each.",
      input: { mode: "breakdown" },
    };
  }

  // 6. Pick next TODO ticket whose deps are all DONE.
  const todos = project.tickets.filter((t) => t.status === "TODO");
  const doneIds = new Set(project.tickets.filter((t) => t.status === "DONE").map((t) => t.id));
  const ready = todos.find((t) => t.dependsOn.every((d) => doneIds.has(d)));

  if (ready) {
    if (ready.role === "INTAKE") {
      // INTAKE is not a ticket role; guard against bad data rather than
      // panicking at runtime.
      throw new Error(`Ticket ${ready.id} has invalid role INTAKE`);
    }
    return {
      type: "run_agent",
      role: ready.role,
      task: `Implement ticket: ${ready.title}`,
      input: { ticketId: ready.id },
    };
  }

  // 7. Any open PR needing QA, then Red Team, in order.
  const openPRs = await prisma.pullRequest.findMany({
    where: { projectId, state: "open" },
    include: { project: false },
  });
  for (const pr of openPRs) {
    // Has QA happened on this PR yet?
    const qaRun = await prisma.agentRun.findFirst({
      where: { projectId, role: "QA", status: "SUCCEEDED" },
      orderBy: { createdAt: "desc" },
    });
    const qaCoveredThisPR =
      qaRun &&
      typeof qaRun.input === "object" &&
      qaRun.input !== null &&
      (qaRun.input as { prNumber?: number }).prNumber === pr.number;

    if (!qaCoveredThisPR) {
      return {
        type: "run_agent",
        role: "QA",
        task: `Review pull request #${pr.number}.`,
        input: { prNumber: pr.number },
      };
    }

    // QA done — now Red Team.
    const redRun = await prisma.agentRun.findFirst({
      where: { projectId, role: "RED_TEAM_QA", status: "SUCCEEDED" },
      orderBy: { createdAt: "desc" },
    });
    const redCoveredThisPR =
      redRun &&
      typeof redRun.input === "object" &&
      redRun.input !== null &&
      (redRun.input as { prNumber?: number }).prNumber === pr.number;

    if (!redCoveredThisPR) {
      return {
        type: "run_agent",
        role: "RED_TEAM_QA",
        task: `Red-team pull request #${pr.number} — try to break it.`,
        input: { prNumber: pr.number },
      };
    }
  }

  // 7b. If all remaining tickets are blocked, wait on human (don't sign off
  // prematurely). A Debug PR is likely open — the human must resolve it.
  const blockedCount = project.tickets.filter((t) => t.status === "BLOCKED").length;
  const doneCount = project.tickets.filter((t) => t.status === "DONE").length;
  if (
    project.tickets.length > 0 &&
    blockedCount > 0 &&
    doneCount + blockedCount === project.tickets.length
  ) {
    return { type: "wait_for_gate", kind: "STUCK_DIAGNOSTIC" };
  }

  // 8. Otherwise, sign off.
  const signoff = project.gates.find((g) => g.kind === "QA_SIGNOFF");
  if (!signoff) {
    return {
      type: "run_agent",
      role: "QA",
      task: "Produce the final QA sign-off report.",
      input: { mode: "signoff" },
    };
  }
  if (signoff.status === "PENDING") return { type: "wait_for_gate", kind: "QA_SIGNOFF" };

  return { type: "done" };
}

export async function enqueueNext(project: Project | { id: string }): Promise<void> {
  const action = await decideNext(project.id);
  if (action.type !== "run_agent") return;

  const run = await prisma.agentRun.create({
    data: {
      projectId: project.id,
      role: action.role,
      task: action.task,
      input: action.input as never,
      status: "QUEUED",
      ticketId: (action.input as { ticketId?: string }).ticketId,
    },
  });

  await getAgentsQueue().add(
    "run",
    {
      runId: run.id,
      projectId: project.id,
      role: action.role,
      task: action.task,
      input: action.input,
      ticketId: (action.input as { ticketId?: string }).ticketId,
    },
    {
      attempts: 3,
      backoff: { type: "exponential", delay: 30_000 },
    },
  );
}
