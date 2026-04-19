/**
 * GitHub webhook verification + event routing.
 *
 * The Next.js API route calls `handleWebhook` with the raw body + signature;
 * we verify with the shared secret, then enqueue an orchestrator event.
 */

import { Webhooks } from "@octokit/webhooks";
import { env } from "../env";
import { prisma } from "../db";
import { orchestratorQueue } from "../queue";

let webhooks: Webhooks | null = null;

export function getWebhooks(): Webhooks {
  if (webhooks) return webhooks;
  if (!env.GITHUB_WEBHOOK_SECRET) {
    throw new Error("GITHUB_WEBHOOK_SECRET is required to handle webhooks.");
  }
  webhooks = new Webhooks({ secret: env.GITHUB_WEBHOOK_SECRET });

  webhooks.on("pull_request.closed", async ({ payload }) => {
    const project = await findProject(payload.repository.owner.login, payload.repository.name);
    if (!project) return;

    await prisma.pullRequest.upsert({
      where: { projectId_number: { projectId: project.id, number: payload.pull_request.number } },
      update: {
        state: "closed",
        merged: payload.pull_request.merged,
      },
      create: {
        projectId: project.id,
        number: payload.pull_request.number,
        title: payload.pull_request.title,
        branch: payload.pull_request.head.ref,
        state: "closed",
        merged: payload.pull_request.merged,
        url: payload.pull_request.html_url,
      },
    });

    if (payload.pull_request.merged) {
      await orchestratorQueue.add("gate-event", {
        projectId: project.id,
        event: "PR_MERGED",
        payload: { number: payload.pull_request.number },
      });
    }
  });

  webhooks.on("pull_request_review.submitted", async ({ payload }) => {
    const project = await findProject(payload.repository.owner.login, payload.repository.name);
    if (!project) return;

    await orchestratorQueue.add("gate-event", {
      projectId: project.id,
      event: "PR_REVIEW",
      payload: {
        number: payload.pull_request.number,
        state: payload.review.state,        // "approved" | "changes_requested" | "commented"
        reviewer: payload.review.user?.login,
        body: payload.review.body ?? "",
      },
    });
  });

  return webhooks;
}

async function findProject(owner: string, repo: string) {
  return prisma.project.findUnique({
    where: { githubOwner_githubRepo: { githubOwner: owner, githubRepo: repo } },
  });
}
