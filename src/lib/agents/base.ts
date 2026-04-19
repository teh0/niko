/**
 * Base agent — shared behavior across all specialized agents.
 *
 * Every agent:
 *  1. Works inside a project workspace (cloned git repo).
 *  2. Receives a task + structured context.
 *  3. Produces code changes AND a structured JSON output (for the orchestrator).
 *  4. Emits streamed messages into the AgentRun transcript.
 *
 * The specialized agents (PM, TechLead, DevWeb, …) only differ in their
 * system prompt, their allowed tool set, and how they post-process the output.
 */

import type { AgentRole } from "@prisma/client";
import { prisma } from "../db";
import { runAgent, extractJson } from "./runtime";
import { ensureWorkspace, type Workspace } from "./workspace";
import { mcpTools } from "./mcp";

/**
 * Prepended to every agent's system prompt. Enforces two cross-cutting
 * behaviors we want to be reflexive for ALL agents:
 *
 *  1. **Consult live docs via Context7** before writing code against a
 *     library/framework. Training data is stale. Hallucinated APIs are the
 *     single biggest source of bad PRs.
 *  2. **Prefer existing repo conventions** over clever new patterns — read
 *     nearby files before adding new ones.
 */
const GLOBAL_PREAMBLE = `
## Non-negotiable working rules

**Rule 1 — Always consult live documentation.**
Before writing code that uses a library, framework, SDK, or external API,
call the Context7 MCP tools to pull its CURRENT docs:
  1. \`mcp__context7__resolve-library-id\` with the library name.
  2. \`mcp__context7__get-library-docs\` with the resolved id, scoping to
     the specific topic (e.g. "routing", "state management", "migrations").
Do this even for libraries you think you know. Your training data is stale;
real APIs drift. Hallucinated imports/signatures are the #1 failure mode —
this rule prevents them. If Context7 doesn't have the library, use WebFetch
on the official docs URL. Never guess an API.

**Rule 2 — Read the existing codebase before adding.**
Before creating a new file, Grep for similar existing patterns. Match the
project's naming, folder structure, and style. New abstractions need a
reason.

**Rule 3 — Close the feedback loop.**
Never declare a task done without observing the real behavior of what you
just built:
  - **Code changes with tests** → run the tests and iterate until green.
    A failing build or red test means the task is NOT done.
  - **Type errors / lint** → run the checker; fix every error you introduced.
  - **UI work with a Figma reference** → render the page in a real browser
    (Playwright MCP), screenshot it, and compare visually to the Figma frame.
    Iterate until the rendering matches (spacing, colors, typography). Pixel-
    perfect when the design calls for it.
  - **Mobile UI** → run \`flutter analyze\`, \`flutter test\`, and add golden
    tests for non-trivial widgets.
  - **Backend endpoint** → exercise it with a request (curl, test client,
    or e2e suite) and verify the status + shape of the response.
If you cannot close the loop (missing dependency, tool unavailable), STOP and
report it as a blocker rather than declaring success. Shipped ≠ implemented.

**Rule 4 — Consult and update the project memory vault.**
The project maintains a persistent "brain" at \`.niko/memory/\` (on the
default branch). You MUST:
  - At the START of every run: read every file in \`.niko/memory/\`.
    - \`decisions.md\` — arbitrations, trade-offs, explicit refusals.
    - \`conventions.md\` — naming, file layout, patterns this project follows.
    - \`glossary.md\` — domain vocabulary.
    - \`pitfalls.md\` — "when you touch X, watch out for Y" accumulated from
       past bugs and regressions.
    - \`stack.md\` — exact versions + rationale for each dependency.
  - At the END of your run, if you learned something future agents should
    know (a non-obvious convention, a landmine you avoided, a decision that
    won't be in the code), APPEND to the relevant file. Keep entries short,
    dated, and actionable. Never invent decisions — only record what
    actually happened or was explicitly chosen.
  - These files live in the project's git repo, so they survive across runs
    and are visible to the human reviewer on every PR.

**Rule 5 — Plan before you act; pause every ~10 turns to re-ground.**
Your first action in any non-trivial run is to write a numbered plan of the
steps you will take. Keep it terse (max 10 bullets). Reference a step number
before each major action you take.
Every 10 tool calls, pause and ask yourself:
  - What was my plan?
  - What is actually done vs what I claimed was done?
  - Am I still on the ticket, or have I drifted?
  - If I'm stuck in a loop (same tool, same error), STOP and report the
    blocker. Do not keep hammering.
Long, meandering runs produce hallucinations. Short, grounded runs ship.

**Rule 6 — Produce the structured JSON output** specified below. The
orchestrator parses it to decide the next step.
`.trim();

export type AgentContext = {
  runId: string;
  projectId: string;
  workspace: Workspace;
  task: string;
  input: Record<string, unknown>;
};

export abstract class BaseAgent<TOutput = unknown> {
  abstract readonly role: AgentRole;
  abstract readonly systemPrompt: string;
  readonly allowedTools?: string[] = undefined; // undefined = all default tools

  /** Whether this agent should have access to the Figma MCP tools. */
  protected useFigma(): boolean {
    return false;
  }

  /** Whether this agent should spawn a real browser (Playwright MCP). */
  protected usePlaywright(): boolean {
    return false;
  }

  /**
   * Hard cap on tool-call turns. Tight limits keep agents from meandering
   * (which correlates strongly with hallucination). Tune per role.
   */
  protected maxTurns(): number {
    return 30;
  }

  /** Final system prompt sent to Claude — preamble + agent-specific prompt. */
  protected fullSystemPrompt(): string {
    return `${GLOBAL_PREAMBLE}\n\n---\n\n${this.systemPrompt}`;
  }

  /** Final tool allowlist — merges agent's declared tools with MCP tools. */
  protected fullAllowedTools(): string[] | undefined {
    if (!this.allowedTools) return undefined;
    return [
      ...this.allowedTools,
      ...mcpTools({ figma: this.useFigma(), playwright: this.usePlaywright() }),
    ];
  }

  /** Optional: describe structured output schema that will be appended to the prompt. */
  protected outputSchema(): string | null {
    return null;
  }

  /** Build the user prompt for the agent. Subclasses may override for custom framing. */
  protected buildPrompt(ctx: AgentContext): string {
    const schema = this.outputSchema();
    const schemaBlock = schema
      ? `\n\nAt the end of your work, output a fenced JSON block matching this schema:\n\`\`\`json\n${schema}\n\`\`\``
      : "";

    return [
      `# Task\n${ctx.task}`,
      `\n# Context\n\`\`\`json\n${JSON.stringify(ctx.input, null, 2)}\n\`\`\``,
      schemaBlock,
    ].join("");
  }

  /** Parse the final text into structured output. Override for custom parsing. */
  protected parseOutput(finalText: string): TOutput | null {
    return extractJson<TOutput>(finalText);
  }

  async run(ctx: AgentContext): Promise<{ output: TOutput | null; finalText: string }> {
    await prisma.agentRun.update({
      where: { id: ctx.runId },
      data: { status: "RUNNING", startedAt: new Date() },
    });

    try {
      const result = await runAgent({
        systemPrompt: this.fullSystemPrompt(),
        prompt: this.buildPrompt(ctx),
        cwd: ctx.workspace.path,
        allowedTools: this.fullAllowedTools(),
        includePlaywright: this.usePlaywright(),
        maxTurns: this.maxTurns(),
        onMessage: async (msg) => {
          // Append each streamed message to the transcript for live views.
          await prisma.$executeRaw`
            UPDATE "AgentRun"
            SET transcript = COALESCE(transcript, '[]'::jsonb) || ${JSON.stringify([msg])}::jsonb
            WHERE id = ${ctx.runId}
          `;
        },
      });

      const output = this.parseOutput(result.finalText);

      await prisma.agentRun.update({
        where: { id: ctx.runId },
        data: {
          status: "SUCCEEDED",
          endedAt: new Date(),
          output: output as never,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
        },
      });

      return { output, finalText: result.finalText };
    } catch (err) {
      await prisma.agentRun.update({
        where: { id: ctx.runId },
        data: {
          status: "FAILED",
          endedAt: new Date(),
          error: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }
}

export async function buildContext(
  runId: string,
  projectId: string,
  task: string,
  input: Record<string, unknown>,
): Promise<AgentContext> {
  const project = await prisma.project.findUniqueOrThrow({ where: { id: projectId } });
  // cloneUrl will be resolved via the GitHub module at call time — see workers.
  // Here we assume the workspace is already prepared by the worker.
  const workspace = await ensureWorkspace(
    projectId,
    (input.cloneUrl as string) ?? "",
    project.defaultBranch,
  );
  return { runId, projectId, workspace, task, input };
}
