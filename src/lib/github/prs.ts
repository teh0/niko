/**
 * Pull request helpers — open / comment / review / close PRs.
 * Every gate in Niko maps to a PR the human reviews on GitHub.
 */

import { getOctokit, type RepoRef } from "./client";

export type OpenPROptions = {
  ref: RepoRef;
  installationId?: bigint | null;
  head: string;          // feature branch
  base: string;          // default branch
  title: string;
  body: string;
  draft?: boolean;
};

export async function openPR(opts: OpenPROptions): Promise<{ number: number; url: string }> {
  const gh = await getOctokit(opts.installationId);
  const { data } = await gh.pulls.create({
    owner: opts.ref.owner,
    repo: opts.ref.repo,
    head: opts.head,
    base: opts.base,
    title: opts.title,
    body: opts.body,
    draft: opts.draft ?? false,
  });
  return { number: data.number, url: data.html_url };
}

export async function commentOnPR(
  ref: RepoRef,
  installationId: bigint | null | undefined,
  number: number,
  body: string,
): Promise<void> {
  const gh = await getOctokit(installationId);
  await gh.issues.createComment({
    owner: ref.owner,
    repo: ref.repo,
    issue_number: number,
    body,
  });
}

export async function reviewPR(
  ref: RepoRef,
  installationId: bigint | null | undefined,
  number: number,
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
  body: string,
): Promise<void> {
  const gh = await getOctokit(installationId);
  await gh.pulls.createReview({
    owner: ref.owner,
    repo: ref.repo,
    pull_number: number,
    event,
    body,
  });
}

export async function getPR(
  ref: RepoRef,
  installationId: bigint | null | undefined,
  number: number,
) {
  const gh = await getOctokit(installationId);
  const { data } = await gh.pulls.get({
    owner: ref.owner,
    repo: ref.repo,
    pull_number: number,
  });
  return data;
}

/**
 * Merge a PR. Squash-merge by default: keeps main tidy with one commit per
 * gate, preserving the PR title/body as the commit message.
 * No-op (returns false) if the PR is already merged or closed.
 */
export async function mergePR(
  ref: RepoRef,
  installationId: bigint | null | undefined,
  number: number,
  opts: { method?: "squash" | "merge" | "rebase"; title?: string; body?: string } = {},
): Promise<boolean> {
  const gh = await getOctokit(installationId);
  const { data: pr } = await gh.pulls.get({
    owner: ref.owner,
    repo: ref.repo,
    pull_number: number,
  });
  if (pr.merged) return false;
  if (pr.state === "closed") return false;

  // Draft PRs can't be merged — mark ready first. Old runs (before we
  // switched defaults) may still be in draft.
  if (pr.draft) {
    await gh.graphql(
      `mutation($id: ID!) { markPullRequestReadyForReview(input: { pullRequestId: $id }) { clientMutationId } }`,
      { id: pr.node_id },
    );
  }

  await gh.pulls.merge({
    owner: ref.owner,
    repo: ref.repo,
    pull_number: number,
    merge_method: opts.method ?? "squash",
    commit_title: opts.title ?? pr.title,
    commit_message: opts.body ?? "",
  });
  return true;
}
