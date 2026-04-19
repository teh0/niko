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

  for await (const msg of iterator) {
    transcript.push(msg);
    await input.onMessage?.(msg);

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
