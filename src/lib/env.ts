import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),

  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_APP_CLIENT_ID: z.string().optional(),
  GITHUB_APP_CLIENT_SECRET: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  GITHUB_PAT: z.string().optional(),

  CLAUDE_CLI_PATH: z.string().default("claude"),
  CLAUDE_HOME: z.string().optional(),

  // Must live outside the studio repo. See src/lib/agents/workspace.ts for
  // the boot-time guard that enforces this. Default is a tmp path writable
  // everywhere; in production, override with a persistent location
  // (e.g. /var/lib/niko/workspaces, already the Docker volume mount).
  WORKSPACE_DIR: z.string().default("/tmp/niko-workspaces"),
  PUBLIC_URL: z.string().url().default("http://localhost:3000"),
  MAX_CONCURRENT_AGENTS: z.coerce.number().default(4),

  ANTHROPIC_API_KEY: z.string().optional(),
  RATE_LIMIT_PAUSE_MINUTES: z.coerce.number().default(60),

  FIGMA_API_KEY: z.string().optional(),
});

export function hasFigmaMCP() {
  return Boolean(env.FIGMA_API_KEY);
}

export const env = schema.parse(process.env);

export function hasGitHubApp() {
  return Boolean(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY);
}

export function hasGitHubPAT() {
  return Boolean(env.GITHUB_PAT);
}
