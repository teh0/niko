/**
 * Gate-chat runtime — streaming chat with the agent who produced a gate.
 *
 * Read-only: the agent can inspect the project workspace (Read/Grep/Glob)
 * but cannot modify files, run code, or push anything. Real changes come
 * from the user clicking "Request changes" (which re-invokes the agent in
 * its normal producing mode via the BullMQ queue).
 */

import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Gate, GateMessage } from "@prisma/client";
import { env } from "../env";
import { systemPromptFor } from "./prompt";
import { ensureWorkspace } from "../agents/workspace";
import { getCloneUrl } from "../github";
import { prisma } from "../db";
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

export type GateStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; fullText: string }
  | { type: "error"; message: string };

export async function* streamGateReply(
  gate: Gate,
  history: GateMessage[],
  latestUser: string,
): AsyncGenerator<GateStreamEvent> {
  const systemPrompt = systemPromptFor(gate.kind, gate.description);
  if (!systemPrompt) {
    yield { type: "error", message: `Gate kind ${gate.kind} does not support chat` };
    return;
  }

  // Try to run the agent inside the project workspace so it can cite files.
  // If the workspace can't be prepared (e.g. repo creds not set), fall
  // back to a tmpdir with no code access.
  let cwd = tmpdir();
  try {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: gate.projectId } });
    const cloneUrl = await getCloneUrl(
      { owner: project.githubOwner, repo: project.githubRepo },
      project.installationId,
    );
    const ws = await ensureWorkspace(project.id, cloneUrl, project.defaultBranch);
    cwd = ws.path;
  } catch {
    // Keep cwd = tmpdir(). The agent will still work from the gate's
    // JSON description alone.
  }

  const convo = history
    .filter((m) => m.role === "USER" || m.role === "AGENT")
    .map((m) => (m.role === "USER" ? `USER: ${m.content}` : `YOU: ${m.content}`))
    .join("\n\n");

  const prompt = [
    `# Gate under discussion`,
    `- kind: **${gate.kind}**`,
    `- title: ${gate.title}`,
    gate.prUrl ? `- PR: ${gate.prUrl}` : "",
    "",
    "# Prior conversation",
    convo || "(this is the first message)",
    "",
    "# Latest user message",
    latestUser,
    "",
    "# Your task",
    "Reply to the user. Respect the chat rules (read-only, stay scoped, no code edits).",
  ].join("\n");

  const childEnv = { ...process.env };
  if (env.CLAUDE_HOME) childEnv.CLAUDE_HOME = env.CLAUDE_HOME;
  if (!env.ANTHROPIC_API_KEY) delete childEnv.ANTHROPIC_API_KEY;

  const options: Options = {
    cwd,
    systemPrompt,
    maxTurns: 100,
    // Read-only toolset — Read/Grep/Glob so the agent can cite files.
    // No Edit/Write/Bash — chat must not mutate the repo.
    allowedTools: ["Read", "Grep", "Glob", "mcp__context7__*"],
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
          const resultText = "result" in msg ? String(msg.result ?? "") : "";
          const label =
            msg.subtype === "error_max_turns"
              ? "trop d'étapes nécessaires (limite atteinte) — reformule ta question plus précisément"
              : msg.subtype === "error_during_execution"
                ? "erreur pendant l'exécution"
                : msg.subtype;
          yield {
            type: "error",
            message: resultText ? `${label} · ${resultText}` : label,
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
