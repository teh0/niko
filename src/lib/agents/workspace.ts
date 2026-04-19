/**
 * Per-project workspace management.
 *
 * ISOLATION GUARANTEE — agents NEVER see the studio's source code:
 *  • Each project has its own clone at `WORKSPACE_DIR/<projectId>/`.
 *  • The agent's `cwd` is pinned to that directory at spawn time.
 *  • The Claude Code CLI scopes its filesystem tools to that cwd.
 *  • We refuse to boot if WORKSPACE_DIR overlaps the studio repo.
 *
 * Every code change an agent produces happens here; we commit + push + open
 * a PR via the GitHub module. The studio is write-once (you ship it once to
 * the VPS, then it just runs) while project workspaces are churned through
 * and can be destroyed safely via `destroyWorkspace`.
 */

import { spawn } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { env } from "../env";

/** Throws at boot if WORKSPACE_DIR is inside (or equals) the studio repo. */
function assertWorkspaceIsolation(): void {
  const workspaceAbs = resolve(env.WORKSPACE_DIR);
  const studioAbs = resolve(process.cwd());
  if (workspaceAbs === studioAbs || workspaceAbs.startsWith(studioAbs + "/")) {
    throw new Error(
      `WORKSPACE_DIR (${workspaceAbs}) must be OUTSIDE the studio repo (${studioAbs}).\n` +
        `Point it at a dedicated directory (e.g. /var/lib/niko/workspaces).`,
    );
  }
}
assertWorkspaceIsolation();

export type Workspace = {
  projectId: string;
  path: string;
};

export async function ensureWorkspace(
  projectId: string,
  cloneUrl: string,
  defaultBranch: string,
): Promise<Workspace> {
  const path = join(env.WORKSPACE_DIR, projectId);
  const exists = await stat(path).catch(() => null);

  if (!exists) {
    await mkdir(env.WORKSPACE_DIR, { recursive: true });
    await git(env.WORKSPACE_DIR, ["clone", cloneUrl, projectId]);
  } else {
    await git(path, ["fetch", "origin"]);
    await git(path, ["checkout", defaultBranch]);
    await git(path, ["reset", "--hard", `origin/${defaultBranch}`]);
    await git(path, ["clean", "-fdx"]);
  }

  return { projectId, path };
}

export async function destroyWorkspace(projectId: string): Promise<void> {
  const path = join(env.WORKSPACE_DIR, projectId);
  await rm(path, { recursive: true, force: true });
}

export async function checkoutBranch(
  ws: Workspace,
  branch: string,
  base: string,
): Promise<void> {
  await git(ws.path, ["checkout", base]);
  await git(ws.path, ["pull", "origin", base]);
  // Recreate from base — ok if the branch already exists remotely, we'll sync.
  await git(ws.path, ["checkout", "-B", branch]);
}

export async function commitAll(
  ws: Workspace,
  message: string,
  author = "Niko Studio <bot@niko.studio>",
): Promise<boolean> {
  await git(ws.path, ["add", "-A"]);
  const statusRaw = await gitOutput(ws.path, ["status", "--porcelain"]);
  if (!statusRaw.trim()) return false;

  await git(ws.path, [
    "-c",
    `user.name=${author.split("<")[0].trim()}`,
    "-c",
    `user.email=${author.match(/<(.+)>/)?.[1] ?? "bot@niko.studio"}`,
    "commit",
    "-m",
    message,
  ]);
  return true;
}

export async function pushBranch(ws: Workspace, branch: string): Promise<void> {
  await git(ws.path, ["push", "-u", "origin", branch]);
}

async function git(cwd: string, args: string[]): Promise<void> {
  await run("git", args, cwd);
}

async function gitOutput(cwd: string, args: string[]): Promise<string> {
  return run("git", args, cwd, { capture: true });
}

function run(
  cmd: string,
  args: string[],
  cwd: string,
  opts: { capture?: boolean } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: opts.capture ? "pipe" : "inherit" });
    let out = "";
    child.stdout?.on("data", (d) => (out += d.toString()));
    child.stderr?.on("data", (d) => (out += d.toString()));
    child.on("exit", (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} ${args.join(" ")} failed (${code}): ${out}`));
    });
    child.on("error", reject);
  });
}
