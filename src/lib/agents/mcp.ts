/**
 * MCP server configuration for agents.
 *
 * We plug two MCP servers into every agent run:
 *
 *  1. **Context7** — live, indexed documentation for libraries/frameworks.
 *     Forces the agent to read current docs instead of relying on its
 *     (potentially outdated) training data. No API key required.
 *     https://github.com/upstash/context7
 *
 *  2. **Figma Context MCP** — read access to Figma design files. Enabled
 *     only when FIGMA_API_KEY is set. PM / Dev Web / Dev Mobile agents lean
 *     on this when the project has Figma mockups attached.
 *     https://github.com/GLips/Figma-Context-MCP
 */

import type { Options } from "@anthropic-ai/claude-agent-sdk";
import { env, hasFigmaMCP } from "../env";

export function buildMcpServers(opts: { includePlaywright?: boolean } = {}): Options["mcpServers"] {
  const servers: NonNullable<Options["mcpServers"]> = {};

  // Context7 — live docs. Free, no auth for basic usage.
  servers.context7 = {
    type: "stdio",
    command: "npx",
    args: ["-y", "@upstash/context7-mcp"],
  };

  // Figma — only if the key is configured.
  if (hasFigmaMCP()) {
    servers.figma = {
      type: "stdio",
      command: "npx",
      args: ["-y", "figma-developer-mcp", "--stdio"],
      env: { FIGMA_API_KEY: env.FIGMA_API_KEY! },
    };
  }

  // Playwright MCP — real browser control for visual feedback loops.
  // Heavy (launches Chromium), so only loaded for agents that need it.
  if (opts.includePlaywright) {
    servers.playwright = {
      type: "stdio",
      command: "npx",
      args: ["-y", "@playwright/mcp@latest", "--headless"],
    };
  }

  return servers;
}

/**
 * Tool names exposed by each MCP server (prefixed `mcp__<server>__<tool>`).
 * Agents declare which of these they want via `allowedTools`.
 */
export const MCP_TOOL_NAMES = {
  context7: [
    "mcp__context7__resolve-library-id",
    "mcp__context7__get-library-docs",
  ],
  figma: [
    "mcp__figma__get_figma_data",
    "mcp__figma__download_figma_images",
  ],
  // Playwright MCP is tool-heavy; we allow the server and let the CLI
  // auto-discover its tools with a wildcard.
  playwright: ["mcp__playwright__*"],
} as const;

export function mcpTools(opts: { figma?: boolean; playwright?: boolean }): string[] {
  return [
    ...MCP_TOOL_NAMES.context7,
    ...(opts.figma && hasFigmaMCP() ? MCP_TOOL_NAMES.figma : []),
    ...(opts.playwright ? MCP_TOOL_NAMES.playwright : []),
  ];
}
