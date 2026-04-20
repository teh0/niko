/**
 * Agent worker — drains the `niko.agents` queue, runs the right agent,
 * commits + pushes the work, opens/updates a GitHub PR, creates the Gate.
 */

import { Worker, type Job } from "bullmq";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { QUEUE_NAMES, getAgentsQueue, getConnection, type AgentJobData } from "../queue";
import { prisma } from "../db";
import { env } from "../env";
import { AGENTS } from "../agents";
import { RateLimitError, StuckOnErrorError } from "../agents/runtime";
import {
  ensureWorkspace,
  checkoutBranch,
  commitAll,
  pushBranch,
  diffAgainstBase,
} from "../agents/workspace";
import { getCloneUrl, openPR } from "../github";
import { enqueueNext } from "../orchestrator/flow";
import { frenchTitle, frenchCommitSubject, buildPRBody } from "./persona";

export function startAgentWorker() {
  const worker = new Worker<AgentJobData>(
    QUEUE_NAMES.AGENTS,
    async (job) => {
      await runAgentJob(job);
    },
    {
      connection: getConnection(),
      concurrency: env.MAX_CONCURRENT_AGENTS,
    },
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    console.error(`[agents] job ${job.id} failed:`, err.message);

    if (err instanceof RateLimitError) {
      console.warn(
        `[agents] rate-limited — pausing queue for ${err.retryAfterMs / 60_000} min`,
      );
      await getAgentsQueue().pause();
      setTimeout(async () => {
        console.info("[agents] resuming queue after rate limit window");
        await getAgentsQueue().resume();
      }, err.retryAfterMs);
      return;
    }

    if (err instanceof StuckOnErrorError) {
      console.warn(`[agents] stuck on ${err.errorSignature} — queuing Debug agent`);
      await handleStuckRun(job.data, err);
    }
  });

  worker.on("completed", (job) => {
    console.info(`[agents] job ${job.id} done (role=${job.data.role})`);
  });

  return worker;
}

async function runAgentJob(job: Job<AgentJobData>): Promise<void> {
  const { runId, projectId, role, task, input, ticketId } = job.data;

  // Mark the run RUNNING straight away so the UI doesn't show QUEUED if
  // anything in the prep path (cloneUrl, workspace prep) throws below.
  // BaseAgent.run() also sets RUNNING; idempotent.
  await prisma.agentRun.update({
    where: { id: runId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  const prep = await prepareRun(job).catch(async (err) => {
    await prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        endedAt: new Date(),
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  });

  const { project, workspace, branch, cloneUrl } = prep;

  const agent = AGENTS[role];
  const ctx = {
    runId,
    projectId,
    workspace,
    task,
    input: {
      ...input,
      cloneUrl,
      defaultBranch: project.defaultBranch,
      ticketId,
      figmaUrl: project.figmaUrl,
    },
  };

  const { output, finalText } = await agent.run(ctx);

  // Tech Lead in 'breakdown' mode produces the ticket list — materialize
  // it into the DB so the backlog fills up and the flow can start
  // dispatching tickets to devs.
  const isBreakdown = role === "TECH_LEAD" && input.mode === "breakdown";
  if (isBreakdown) {
    await persistTicketBreakdown(projectId, output);
  }

  // Breakdown produces tickets in DB only — no code to review, no PR
  // to merge. If the agent accidentally wrote files, we discard them
  // rather than opening an orphan PR.
  if (isBreakdown) {
    await enqueueNext({ id: projectId });
    return;
  }

  // Resolve the ticket's title if this run is implementing a ticket —
  // used to craft a human PR title like '🌐 Login form' instead of
  // '[DEV_WEB] Implement ticket: Login form'.
  const ticket = ticketId
    ? await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: { title: true },
      })
    : null;
  const ticketTitle = ticket?.title;

  // Count past gates of the same kind to surface an iteration number on
  // revisions. Humans get 'itération 2' etc. in the PR body.
  const gateKindForThisRun = gateKindFor(role, input);
  const iteration = gateKindForThisRun
    ? (await prisma.gate.count({
        where: { projectId, kind: gateKindForThisRun },
      })) + 1
    : 1;

  // Commit + push whatever the agent changed.
  const commitSubject = frenchCommitSubject(role, task, input, ticketTitle);
  const commitBody = (finalText || "").slice(0, 500);
  const committed = await commitAll(
    workspace,
    `${commitSubject}\n\n${commitBody}`,
  );

  let prNumber: number | undefined;
  let prUrl: string | undefined;

  if (committed) {
    await pushBranch(workspace, branch);

    const diff = await diffAgainstBase(workspace, project.defaultBranch);
    const title = frenchTitle(role, task, input, ticketTitle);
    const prBody = buildPRBody({
      role,
      task,
      finalText,
      output,
      ticketTitle,
      iteration,
      diff,
    });

    // NOT draft. GitHub's merge API refuses draft PRs, and we auto-merge
    // on gate approval.
    const pr = await openPR({
      ref: { owner: project.githubOwner, repo: project.githubRepo },
      installationId: project.installationId,
      head: branch,
      base: project.defaultBranch,
      title,
      body: prBody,
      draft: false,
    });
    prNumber = pr.number;
    prUrl = pr.url;

    await prisma.pullRequest.create({
      data: {
        projectId,
        number: pr.number,
        title,
        branch,
        state: "open",
        url: pr.url,
        openedByRole: role,
      },
    });

    if (ticketId) {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: "IN_REVIEW", prNumber: pr.number },
      });
    }
  }

  // Create the matching gate (if this run opens one).
  if (gateKindForThisRun && prNumber) {
    await prisma.gate.create({
      data: {
        projectId,
        kind: gateKindForThisRun,
        title: frenchTitle(role, task, input, ticketTitle),
        description: output ? JSON.stringify(output, null, 2) : finalText.slice(0, 2000),
        prNumber,
        prUrl,
        status: "PENDING",
      },
    });
  }

  // Re-enqueue orchestration decision.
  await enqueueNext({ id: projectId });
}


function gateKindFor(
  role: string,
  input: Record<string, unknown>,
): import("@prisma/client").GateKind | null {
  if (role === "PM") return "SPECS";
  if (role === "TECH_LEAD") {
    const mode = input.mode as string | undefined;
    if (mode === "plan") return "STACK_PLAN";
    if (mode === "scaffold") return "SCAFFOLD";
    return null;
  }
  if (role === "DB_EXPERT") return "DATA_MODEL";
  if (role === "QA" && input.mode === "signoff") return "QA_SIGNOFF";
  if (role === "RED_TEAM_QA") return "RED_TEAM_REVIEW";
  if (role === "DEBUG") return "STUCK_DIAGNOSTIC";
  if (role.startsWith("DEV_")) return "FEATURE_PR";
  return null;
}

// For use by a transcript stream consumer (future).
export type AgentTranscriptMsg = SDKMessage;

type ProposedTicket = {
  title: string;
  description: string;
  role: "DEV_WEB" | "DEV_MOBILE" | "DEV_BACKEND" | "DB_EXPERT" | "QA";
  priority?: number;
  dependsOn?: string[];
  acceptance?: string[];
};

/**
 * Parse the Tech Lead's TicketBreakdownOutput and insert rows in the
 * Ticket table. Resolves intra-batch `dependsOn` by title in a 2nd pass.
 */
async function persistTicketBreakdown(
  projectId: string,
  output: unknown,
): Promise<void> {
  if (!output || typeof output !== "object") return;
  const proposed = (output as { tickets?: unknown }).tickets;
  if (!Array.isArray(proposed)) return;

  const validTickets: ProposedTicket[] = [];
  for (const t of proposed) {
    if (!t || typeof t !== "object") continue;
    const tt = t as ProposedTicket;
    if (
      typeof tt.title === "string" &&
      typeof tt.description === "string" &&
      ["DEV_WEB", "DEV_MOBILE", "DEV_BACKEND", "DB_EXPERT", "QA"].includes(
        tt.role as string,
      )
    ) {
      validTickets.push(tt);
    }
  }
  if (validTickets.length === 0) return;

  // Pass 1 — create without deps.
  const titleToId = new Map<string, string>();
  for (const t of validTickets) {
    const descriptionWithAcceptance = t.acceptance?.length
      ? `${t.description}\n\n## Acceptance\n${t.acceptance.map((a) => `- ${a}`).join("\n")}`
      : t.description;
    const row = await prisma.ticket.create({
      data: {
        projectId,
        title: t.title,
        description: descriptionWithAcceptance,
        role: t.role,
        priority: t.priority ?? 0,
        dependsOn: [],
        status: "TODO",
      },
    });
    titleToId.set(t.title, row.id);
  }

  // Pass 2 — resolve dependsOn by title.
  for (const t of validTickets) {
    if (!t.dependsOn?.length) continue;
    const id = titleToId.get(t.title);
    if (!id) continue;
    const deps = t.dependsOn
      .map((title) => titleToId.get(title))
      .filter((x): x is string => Boolean(x));
    if (deps.length) {
      await prisma.ticket.update({ where: { id }, data: { dependsOn: deps } });
    }
  }
}

/**
 * Resolve everything the run needs before we hand off to the agent:
 * the Project row, a tokenized clone URL, a synced workspace, and a
 * feature branch for this run. Throws on any preparation failure — the
 * caller translates the throw into a DB FAILED row.
 */
async function prepareRun(job: Job<AgentJobData>) {
  const { runId, projectId, role, task, ticketId } = job.data;

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const cloneUrl = await getCloneUrl(
    { owner: project.githubOwner, repo: project.githubRepo },
    project.installationId,
  );
  const workspace = await ensureWorkspace(projectId, cloneUrl, project.defaultBranch);

  const slug = task
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const branch = `niko/${role.toLowerCase()}/${slug}-${runId.slice(-6)}`;
  await checkoutBranch(workspace, branch, project.defaultBranch);

  if (ticketId) {
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "IN_PROGRESS", branch },
    });
  }

  return { project, workspace, branch, cloneUrl };
}

/**
 * Called from the worker's "failed" handler when a run throws
 * StuckOnErrorError. We mark the ticket as blocked, persist a seed blocker
 * note so the Debug agent has something concrete to start from, and queue
 * a Debug run.
 */
async function handleStuckRun(job: AgentJobData, err: StuckOnErrorError): Promise<void> {
  const { projectId, ticketId, role, task } = job;

  if (ticketId) {
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: "BLOCKED" },
    });
  }

  const debugRun = await prisma.agentRun.create({
    data: {
      projectId,
      role: "DEBUG",
      task: `Diagnose stuck run from ${role}: ${task.slice(0, 120)}`,
      input: {
        stuckRunId: job.runId,
        stuckRole: role,
        ticketId: ticketId ?? null,
        errorSignature: err.errorSignature,
        errorSample: err.errorSample,
      } as never,
      status: "QUEUED",
      ticketId: ticketId ?? null,
    },
  });

  await getAgentsQueue().add(
    "run",
    {
      runId: debugRun.id,
      projectId,
      role: "DEBUG",
      task: debugRun.task,
      input: debugRun.input as Record<string, unknown>,
      ticketId: ticketId ?? undefined,
    },
    { attempts: 1 },
  );
}
