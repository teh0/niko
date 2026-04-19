/**
 * Thin wrapper around the Claude Agent SDK.
 *
 * Auth model: we rely on the `claude` CLI already being logged in on the host
 * (via `claude login`, using the Claude MAX subscription). The SDK spawns that
 * CLI under the hood, so no API key is involved.
 *
 * Each AgentRun corresponds to one `query()` call. We stream messages into the
 * DB for observability and replay.
 */

import { createHash } from "node:crypto";
import { query, type Options, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { env } from "../env";
import { buildMcpServers } from "./mcp";

export class RateLimitError extends Error {
  constructor(
    message: string,
    public retryAfterMs: number,
  ) {
    super(message);
    this.name = "RateLimitError";
  }
}

/**
 * Thrown when an agent appears stuck on the same error — it has produced
 * three tool results with the same normalized error signature. Triggers a
 * hand-off to the Debug agent.
 */
export class StuckOnErrorError extends Error {
  constructor(
    message: string,
    public errorSignature: string,
    public errorSample: string,
  ) {
    super(message);
    this.name = "StuckOnErrorError";
  }
}

export type RunInput = {
  systemPrompt: string;
  prompt: string;
  cwd: string;
  allowedTools?: string[];
  maxTurns?: number;
  includePlaywright?: boolean;
  onMessage?: (msg: SDKMessage) => void | Promise<void>;
};

export type RunResult = {
  finalText: string;
  transcript: SDKMessage[];
  tokensIn?: number;
  tokensOut?: number;
};

function isRateLimitMessage(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("rate limit") ||
    t.includes("rate_limit") ||
    t.includes("429") ||
    t.includes("usage limit reached") ||
    t.includes("claude code usage")
  );
}

/**
 * Extract a normalized error signature from a tool result, or null if the
 * content doesn't look like an error. We strip volatile noise (absolute
 * paths, line numbers, uuids, timestamps, hex) so that "the same error
 * seen 3 times" collapses to one signature even when the stack frame
 * trivia changes.
 */
function errorSignature(text: string): string | null {
  if (!text) return null;
  // Heuristic: does it smell like an error?
  const smells = [
    "error:",
    "error ",
    "exception",
    "traceback",
    "failed",
    "cannot find",
    "cannot read",
    "is not a function",
    "is not defined",
    "segmentation fault",
    "panic:",
    "assertion",
    "typeerror",
    "syntaxerror",
    "unhandledpromiserejection",
    "enoent",
    "eaddrinuse",
    "econnrefused",
    "  at ", // stack frames
  ];
  const lower = text.toLowerCase();
  if (!smells.some((s) => lower.includes(s))) return null;

  // Keep only the first ~1500 chars of relevant error content.
  const head = text.slice(0, 1500);

  const normalized = head
    // absolute paths
    .replace(/\/[^\s)'"]*\/[^\s)'"]+/g, "/<path>")
    // line:col numbers
    .replace(/:\d+(:\d+)?/g, ":<N>")
    // hex / pointer values
    .replace(/0x[0-9a-f]+/gi, "0x<HEX>")
    // uuids
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<UUID>")
    // ISO timestamps
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, "<TS>")
    // long digits (PIDs, ports, durations)
    .replace(/\b\d{4,}\b/g, "<N>")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  return createHash("sha1").update(normalized).digest("hex").slice(0, 16);
}

/**
 * Extract the visible text content of a tool_result message from the SDK.
 * Different SDK versions package this slightly differently; we try a few
 * shapes before giving up.
 */
function extractToolResultText(msg: SDKMessage): string | null {
  if (msg.type !== "user") return null;
  const content = (msg as { message?: { content?: unknown } }).message?.content;
  if (!content) return null;

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const c of content) {
      if (typeof c !== "object" || c === null) continue;
      const entry = c as { type?: string; content?: unknown; tool_use_id?: string; is_error?: boolean };
      if (entry.type !== "tool_result") continue;
      if (typeof entry.content === "string") parts.push(entry.content);
      else if (Array.isArray(entry.content)) {
        for (const sub of entry.content) {
          if (typeof sub === "object" && sub !== null && "text" in sub) {
            parts.push(String((sub as { text: unknown }).text));
          }
        }
      }
    }
    return parts.length ? parts.join("\n") : null;
  }

  return typeof content === "string" ? content : null;
}

export async function runAgent(input: RunInput): Promise<RunResult> {
  const transcript: SDKMessage[] = [];
  let finalText = "";
  let tokensIn: number | undefined;
  let tokensOut: number | undefined;

  // Build the process env:
  // - if ANTHROPIC_API_KEY is set, the CLI uses it (fallback mode).
  // - otherwise the CLI falls back to the OAuth session (Claude MAX).
  const childEnv = { ...process.env };
  if (env.CLAUDE_HOME) childEnv.CLAUDE_HOME = env.CLAUDE_HOME;
  if (!env.ANTHROPIC_API_KEY) delete childEnv.ANTHROPIC_API_KEY;

  const options: Options = {
    cwd: input.cwd,
    systemPrompt: input.systemPrompt,
    maxTurns: input.maxTurns ?? 30,
    allowedTools: input.allowedTools,
    mcpServers: buildMcpServers({ includePlaywright: input.includePlaywright }),
    pathToClaudeCodeExecutable: env.CLAUDE_CLI_PATH,
    env: childEnv,
  };

  const iterator = query({ prompt: input.prompt, options });

  // Loop detector: track how many times the same normalized error signature
  // shows up in tool results. Three strikes → we throw and hand off to the
  // Debug agent rather than letting the agent shotgun more fixes.
  const errorSeen = new Map<string, { count: number; sample: string }>();
  const STUCK_THRESHOLD = 3;

  for await (const msg of iterator) {
    transcript.push(msg);
    await input.onMessage?.(msg);

    const errText = extractToolResultText(msg);
    if (errText) {
      const sig = errorSignature(errText);
      if (sig) {
        const entry = errorSeen.get(sig) ?? { count: 0, sample: errText.slice(0, 600) };
        entry.count += 1;
        errorSeen.set(sig, entry);
        if (entry.count >= STUCK_THRESHOLD) {
          throw new StuckOnErrorError(
            `Agent stuck on the same error (seen ${entry.count} times)`,
            sig,
            entry.sample,
          );
        }
      }
    }

    if (msg.type === "result") {
      if (msg.subtype === "success") {
        finalText = msg.result;
      } else if (msg.subtype === "error_max_turns" || msg.subtype === "error_during_execution") {
        const errText = "result" in msg ? String(msg.result) : "";
        if (isRateLimitMessage(errText)) {
          throw new RateLimitError(errText, env.RATE_LIMIT_PAUSE_MINUTES * 60_000);
        }
        throw new Error(`Agent run failed (${msg.subtype}): ${errText}`);
      }
      if ("usage" in msg && msg.usage) {
        tokensIn = msg.usage.input_tokens;
        tokensOut = msg.usage.output_tokens;
      }
    }
  }

  return { finalText, transcript, tokensIn, tokensOut };
}

/**
 * Try to extract a JSON object from the agent's final text.
 * Agents are instructed to wrap structured output in ```json ... ``` blocks.
 */
export function extractJson<T = unknown>(text: string): T | null {
  const fence = text.match(/```json\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1]) as T;
    } catch {
      return null;
    }
  }
  // Fallback: try parsing the whole thing
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
