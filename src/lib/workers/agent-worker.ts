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
import { RateLimitError } from "../agents/runtime";
import { ensureWorkspace, checkoutBranch, commitAll, pushBranch } from "../agents/workspace";
import { getCloneUrl, openPR } from "../github";
import { enqueueNext } from "../orchestrator/flow";

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
    }
  });

  worker.on("completed", (job) => {
    console.info(`[agents] job ${job.id} done (role=${job.data.role})`);
  });

  return worker;
}

async function runAgentJob(job: Job<AgentJobData>): Promise<void> {
  const { runId, projectId, role, task, input, ticketId } = job.data;

  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  const cloneUrl = await getCloneUrl(
    { owner: project.githubOwner, repo: project.githubRepo },
    project.installationId,
  );
  const workspace = await ensureWorkspace(projectId, cloneUrl, project.defaultBranch);

  // Choose a branch name for this run.
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

  // Commit + push whatever the agent changed.
  const committed = await commitAll(
    workspace,
    `[${role}] ${task}\n\n${(finalText || "").slice(0, 500)}`,
  );

  let prNumber: number | undefined;
  let prUrl: string | undefined;

  if (committed) {
    await pushBranch(workspace, branch);

    const prBody = buildPRBody({ role, task, finalText, output });
    const pr = await openPR({
      ref: { owner: project.githubOwner, repo: project.githubRepo },
      installationId: project.installationId,
      head: branch,
      base: project.defaultBranch,
      title: prTitle(role, task),
      body: prBody,
      draft: role !== "QA",
    });
    prNumber = pr.number;
    prUrl = pr.url;

    await prisma.pullRequest.create({
      data: {
        projectId,
        number: pr.number,
        title: prTitle(role, task),
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
  const gateKind = gateKindFor(role, input);
  if (gateKind && prNumber) {
    await prisma.gate.create({
      data: {
        projectId,
        kind: gateKind,
        title: prTitle(role, task),
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

function prTitle(role: string, task: string): string {
  return `[${role}] ${task.slice(0, 72)}`;
}

function buildPRBody(args: {
  role: string;
  task: string;
  finalText: string;
  output: unknown;
}): string {
  const outBlock = args.output
    ? `\n\n<details><summary>Structured output</summary>\n\n\`\`\`json\n${JSON.stringify(args.output, null, 2)}\n\`\`\`\n</details>`
    : "";
  return [
    `> Auto-opened by **Niko Studio** — agent: \`${args.role}\``,
    ``,
    `**Task**`,
    args.task,
    ``,
    `**Agent summary**`,
    args.finalText.slice(0, 4000),
    outBlock,
    ``,
    `---`,
    `_Review and approve on GitHub to advance the project._`,
  ].join("\n");
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
  if (role.startsWith("DEV_")) return "FEATURE_PR";
  return null;
}

// For use by a transcript stream consumer (future).
export type AgentTranscriptMsg = SDKMessage;
