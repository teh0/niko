/**
 * PM chat runtime — ongoing project-level chat with the Product Manager.
 *
 * Read-only on the filesystem. Can emit a structured JSON block with
 * `createTickets` that the API route parses and persists.
 */

import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Project, ProjectMessage, Ticket, Gate } from "@prisma/client";
import { env } from "../env";
import { PM_CHAT_SYSTEM_PROMPT } from "./prompt";
import { ensureWorkspace } from "../agents/workspace";
import { getCloneUrl } from "../github";
import { buildMcpServers } from "../agents/mcp";

let resolvedClaudePath: string | null = null;
function resolveClaudePath(): string {
  if (resolvedClaudePath) return resolvedClaudePath;
  const configured = env.CLAUDE_CLI_PATH;
  if (configured.startsWith("/") && existsSync(configured)) {
    resolvedClaudePath = configured;
    return resolvedClaudePath;
  }
  resolvedClaudePath = execSync(`command -v ${configured}`, { encoding: "utf8" }).trim();
  return resolvedClaudePath;
}

export type PmStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; fullText: string }
  | { type: "error"; message: string };

export type PmChatContext = {
  project: Project;
  tickets: Ticket[];
  gates: Gate[];
};

export async function* streamPmReply(
  ctx: PmChatContext,
  history: ProjectMessage[],
  latestUser: string,
): AsyncGenerator<PmStreamEvent> {
  // Try to run inside the workspace so the PM can cite files. Fall back
  // to a tmp dir if cloning fails.
  let cwd = tmpdir();
  try {
    const cloneUrl = await getCloneUrl(
      { owner: ctx.project.githubOwner, repo: ctx.project.githubRepo },
      ctx.project.installationId,
    );
    const ws = await ensureWorkspace(ctx.project.id, cloneUrl, ctx.project.defaultBranch);
    cwd = ws.path;
  } catch {
    // ok, no workspace access this turn
  }

  const convo = history
    .filter((m) => m.role === "USER" || m.role === "AGENT")
    .map((m) => (m.role === "USER" ? `USER: ${m.content}` : `YOU: ${m.content}`))
    .join("\n\n");

  const ticketSummary = ctx.tickets.length
    ? ctx.tickets
        .map((t) => `- [${t.status}] ${t.title} (${t.role})`)
        .join("\n")
    : "(no tickets yet)";

  const gateSummary = ctx.gates.length
    ? ctx.gates
        .slice(0, 8)
        .map((g) => `- ${g.kind} · ${g.status}${g.decision ? ` (${g.decision})` : ""}: ${g.title}`)
        .join("\n")
    : "(no gates yet)";

  const prompt = [
    `# Project`,
    `Name: ${ctx.project.name}`,
    `Repo: ${ctx.project.githubOwner}/${ctx.project.githubRepo}`,
    `Status: ${ctx.project.status}`,
    "",
    `# Brief`,
    ctx.project.brief.slice(0, 4000),
    "",
    `# Current tickets`,
    ticketSummary,
    "",
    `# Recent gates`,
    gateSummary,
    "",
    `# Prior chat`,
    convo || "(this is the first PM message in this chat)",
    "",
    `# Latest user message`,
    latestUser,
    "",
    `# Your task`,
    "Reply to the user. If scope is agreed, emit the createTickets JSON at the end.",
  ].join("\n");

  const childEnv = { ...process.env };
  if (env.CLAUDE_HOME) childEnv.CLAUDE_HOME = env.CLAUDE_HOME;
  if (!env.ANTHROPIC_API_KEY) delete childEnv.ANTHROPIC_API_KEY;

  const options: Options = {
    cwd,
    systemPrompt: PM_CHAT_SYSTEM_PROMPT,
    maxTurns: 10,
    allowedTools: [
      "Read",
      "Grep",
      "Glob",
      "mcp__context7__resolve-library-id",
      "mcp__context7__get-library-docs",
    ],
    mcpServers: buildMcpServers(),
    pathToClaudeCodeExecutable: resolveClaudePath(),
    env: childEnv,
  };

  let fullText = "";
  try {
    for await (const msg of query({ prompt, options })) {
      const delta = extractAssistantDelta(msg);
      if (delta) {
        fullText += delta;
        yield { type: "delta", text: delta };
      }
      if (msg.type === "result") {
        if (msg.subtype !== "success") {
          yield {
            type: "error",
            message: "result" in msg ? String(msg.result) : "unknown agent error",
          };
          return;
        }
        fullText = fullText || msg.result;
      }
    }
    yield { type: "done", fullText };
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

function extractAssistantDelta(msg: SDKMessage): string | null {
  if (msg.type !== "assistant") return null;
  const content = (msg as { message?: { content?: unknown } }).message?.content;
  if (!Array.isArray(content)) return null;
  const parts: string[] = [];
  for (const c of content) {
    if (typeof c === "object" && c !== null && "type" in c && (c as { type: string }).type === "text") {
      const t = (c as { text?: unknown }).text;
      if (typeof t === "string") parts.push(t);
    }
  }
  return parts.length ? parts.join("") : null;
}

/** Parse a createTickets JSON block from the agent's reply. */
export type ProposedTicket = {
  title: string;
  description: string;
  role: "DEV_WEB" | "DEV_MOBILE" | "DEV_BACKEND" | "DB_EXPERT" | "QA";
  priority?: number;
  dependsOn?: string[];
};

export function extractProposedTickets(text: string): ProposedTicket[] {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[1]) as { createTickets?: ProposedTicket[] };
    if (!parsed.createTickets || !Array.isArray(parsed.createTickets)) return [];
    return parsed.createTickets.filter(
      (t) =>
        typeof t.title === "string" &&
        typeof t.description === "string" &&
        ["DEV_WEB", "DEV_MOBILE", "DEV_BACKEND", "DB_EXPERT", "QA"].includes(t.role),
    );
  } catch {
    return [];
  }
}
