/**
 * Intake runtime — pure conversational streaming wrapper around the Claude
 * Agent SDK. No tools, no workspace, no PRs. Each turn: take the full
 * conversation history, call query(), stream assistant text back.
 */

import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { IntakeMessage } from "@prisma/client";
import { env } from "../env";
import { INTAKE_SYSTEM_PROMPT } from "./prompt";

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

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; fullText: string }
  | { type: "error"; message: string };

export async function* streamIntakeReply(
  history: IntakeMessage[],
  latestUser: string,
): AsyncGenerator<StreamEvent> {
  // Rebuild the conversation as a single prompt. The Agent SDK takes a
  // string and produces a new reply — we don't need the SDK's multi-turn
  // mode for intake (each HTTP request is stateless anyway).
  const convo = history
    .filter((m) => m.role === "USER" || m.role === "AGENT")
    .map((m) => (m.role === "USER" ? `USER: ${m.content}` : `YOU: ${m.content}`))
    .join("\n\n");

  const prompt = [
    "# Prior conversation",
    convo || "(this is the very first message)",
    "",
    "# Latest user message",
    latestUser,
    "",
    "# Your task",
    "Respond with your next question OR, if you have enough to finalize, the structured brief + trigger sentence + JSON block (see system rules).",
  ].join("\n");

  const childEnv = { ...process.env };
  if (env.CLAUDE_HOME) childEnv.CLAUDE_HOME = env.CLAUDE_HOME;
  if (!env.ANTHROPIC_API_KEY) delete childEnv.ANTHROPIC_API_KEY;

  const options: Options = {
    cwd: tmpdir(), // intake doesn't touch a project workspace
    systemPrompt: INTAKE_SYSTEM_PROMPT,
    maxTurns: 100,
    allowedTools: [], // no tool use, pure text
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
        if (msg.subtype === "success") {
          // result payload usually repeats the final text; prefer what we
          // already streamed to avoid duplication.
          fullText = fullText || msg.result;
        } else {
          yield {
            type: "error",
            message: "result" in msg ? String(msg.result) : "unknown agent error",
          };
          return;
        }
      }
    }
    yield { type: "done", fullText };
  } catch (err) {
    yield { type: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

/** Pull newly-emitted assistant text out of an SDK message, or null. */
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

/**
 * Given the agent's final text, try to extract the structured brief JSON.
 * Returns null if the agent hasn't finalized yet.
 */
export type IntakeFinalBrief = {
  name: string;
  githubRepo: string;        // "owner/repo"
  figmaUrl?: string;
  brief: string;
  coverage: Record<string, { done: boolean; note?: string }>;
  openQuestions: string[];
};

export function extractFinalBrief(text: string): IntakeFinalBrief | null {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.name === "string" &&
      typeof parsed.githubRepo === "string" &&
      typeof parsed.brief === "string"
    ) {
      return parsed as IntakeFinalBrief;
    }
    return null;
  } catch {
    return null;
  }
}

export function looksReadyToFinalize(text: string): boolean {
  return /ready to kick this off/i.test(text);
}
