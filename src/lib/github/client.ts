/**
 * GitHub client — supports both GitHub App (recommended) and PAT (fallback).
 *
 * The App path needs:
 *   - GITHUB_APP_ID
 *   - GITHUB_APP_PRIVATE_KEY (PEM)
 *   - An installation on the target repo, whose id is stored on Project.installationId.
 *
 * The PAT path needs GITHUB_PAT and grants access to whatever the token permits.
 */

import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { env, hasGitHubApp, hasGitHubPAT } from "../env";

function normalizePrivateKey(raw: string): string {
  // Accept either raw PEM or a single-line version with literal \n.
  return raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
}

/**
 * Returns an Octokit authenticated as the App installation for a project,
 * or as the PAT user if we're in PAT mode.
 */
export async function getOctokit(installationId?: bigint | null): Promise<Octokit> {
  if (hasGitHubApp() && installationId) {
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: env.GITHUB_APP_ID,
        privateKey: normalizePrivateKey(env.GITHUB_APP_PRIVATE_KEY!),
        installationId: Number(installationId),
        clientId: env.GITHUB_APP_CLIENT_ID,
        clientSecret: env.GITHUB_APP_CLIENT_SECRET,
      },
    });
  }

  if (hasGitHubPAT()) {
    return new Octokit({ auth: env.GITHUB_PAT });
  }

  throw new Error("No GitHub credentials configured (set GITHUB_APP_* or GITHUB_PAT).");
}

/** An Octokit authenticated as the App itself (no installation) — used for webhooks and app-level ops. */
export async function getAppOctokit(): Promise<Octokit> {
  if (!hasGitHubApp()) throw new Error("GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY required.");
  return new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: env.GITHUB_APP_ID,
      privateKey: normalizePrivateKey(env.GITHUB_APP_PRIVATE_KEY!),
    },
  });
}

export type RepoRef = { owner: string; repo: string };

export async function getCloneUrl(
  ref: RepoRef,
  installationId?: bigint | null,
): Promise<string> {
  // For App mode, we use a tokenized URL valid for this installation.
  if (hasGitHubApp() && installationId) {
    const appOctokit = await getAppOctokit();
    const { data } = await appOctokit.apps.createInstallationAccessToken({
      installation_id: Number(installationId),
    });
    return `https://x-access-token:${data.token}@github.com/${ref.owner}/${ref.repo}.git`;
  }
  if (hasGitHubPAT()) {
    return `https://x-access-token:${env.GITHUB_PAT}@github.com/${ref.owner}/${ref.repo}.git`;
  }
  throw new Error("No GitHub credentials configured.");
}
