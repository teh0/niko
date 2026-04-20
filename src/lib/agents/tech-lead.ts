import { BaseAgent } from "./base";

export type StackChoice = {
  web?: { framework: "nextjs"; version?: string; notes?: string };
  mobile?: { framework: "flutter"; version?: string; notes?: string };
  backend?: {
    framework: "nestjs" | "nextjs-api" | "none";
    style?: "monolith" | "microservices";
    services?: string[];
    notes?: string;
  };
  database?: {
    engine: "postgres" | "mysql" | "sqlite" | "mongodb" | "firestore" | "none";
    orm?: "prisma" | "typeorm" | "drizzle" | "none";
    notes?: string;
  };
  monorepo?: { tool: "turborepo" | "none"; layout?: string[] };
  hosting?: { web?: string; mobile?: string; backend?: string };
};

export type StackPlanOutput = {
  decision: StackChoice;
  rationale: string;
  tradeoffs: string[];
  adrDocPath: string;
};

export type ScaffoldOutput = {
  rootFiles: string[];
  packages: string[];
  bootstrap: Array<{ command: string; description: string }>;
};

export type TicketBreakdownOutput = {
  tickets: Array<{
    title: string;
    description: string;
    role: "DEV_WEB" | "DEV_MOBILE" | "DEV_BACKEND" | "DB_EXPERT" | "QA";
    priority: number;
    dependsOn: string[];
    acceptance: string[];
  }>;
};

// ─── Prompt fragments ────────────────────────────────────────────────────

const CORE = `
You are the Tech Lead of Niko, a small AI-driven software studio. You
own technical decisions for each project.

Standing conventions (unless overridden by the specs):
• Web: Next.js (App Router, TypeScript)
• Mobile: Flutter (latest stable)
• Backend: NestJS (microservices) for heavy work, Next.js API routes for light
• Monorepo: Turborepo + pnpm
• DB: Postgres + Prisma (DB Expert can override)
• CI: GitHub Actions proportional to the stack

Working directory (STRICT): your cwd IS the project repo root. Create
files at \`./<path>\`, never \`./<project-name>/<path>\`. Never use \`~\`
or absolute paths starting with \`/Users/\`, \`/home/\` — you'll escape
the workspace and find stale files on the host. Chain cd+cmd in a
single bash call (shell state doesn't persist between tool calls).
`.trim();

const MODES = {
  plan: `
**Your task: write the Stack Plan ADR**

Read the PM specs (\`docs/specs/*.md\`), then write \`docs/adr/0001-stack-plan.md\`
justifying EVERY major choice (monorepo vs single, NestJS vs Next API,
SQL vs NoSQL…) against the specs. Be decisive; if specs are ambiguous,
pick the most defensible option and note why.

Output the StackPlan JSON (schema below).
`.trim(),

  scaffold: `
**Your task: scaffold the repo**

Create directories, config files, package.jsons, tsconfig, turbo.json if
monorepo, pubspec.yaml if Flutter, nest-cli.json if NestJS, .gitignore,
CI yaml. A working, buildable skeleton with a hello-world in each app —
not features.

Also seed the memory vault and checklist template:
- \`.niko/memory/decisions.md\` — approved stack plan summary
- \`.niko/memory/conventions.md\` — folder layout, naming, state mgmt
- \`.niko/memory/glossary.md\` — empty header
- \`.niko/memory/pitfalls.md\` — empty header
- \`.niko/memory/stack.md\` — exact versions + rationale
- \`.niko/CHECKLIST.template.md\` — PR checklist template
- \`CONTRIBUTING.md\` — short note about using the template + memory vault

Output the Scaffold JSON (schema below).
`.trim(),

  breakdown: `
**Your task: split the specs into atomic implementation tickets**

Each ticket: title, description (what + done criteria), role (owning
agent), dependencies. MUST be atomic: ≤ 4 hours of work / 200-300 LOC.
If a ticket description exceeds ~12 lines, split it.

**Exploration efficace (important)**:
1. ONE \`Glob("**/*")\` to map the tree (exclude node_modules, .git, dist).
2. Read each relevant file AT MOST ONCE — your context retains it.
3. Do NOT use the \`Agent\` tool — sub-agents re-explore from scratch and
   waste tokens.
4. Don't try paths Glob didn't return.

Files to consult (in order): docs/specs/*.md → docs/adr/*.md →
.niko/memory/*.md → list of package.jsons / pubspec.yaml for context
on the apps. Skip the apps' source code — the scaffold structure is
enough to split tickets.

Output the TicketBreakdown JSON (schema below).
`.trim(),
} as const;

const OUTPUT_SCHEMAS = {
  plan: `{ "decision": {...stack choice...}, "rationale": "...", "tradeoffs": ["..."], "adrDocPath": "docs/adr/0001-stack-plan.md" }`,
  scaffold: `{ "rootFiles": ["..."], "packages": ["..."], "bootstrap": [{"command": "...", "description": "..."}] }`,
  breakdown: `{ "tickets": [{ "title": "...", "description": "...", "role": "DEV_WEB|DEV_MOBILE|DEV_BACKEND|DB_EXPERT|QA", "priority": 0, "dependsOn": ["other-title"], "acceptance": ["..."] }] }`,
} as const;

type Mode = keyof typeof MODES;

function resolveMode(input?: Record<string, unknown>): Mode {
  const m = (input?.mode as string | undefined) ?? "plan";
  return (["plan", "scaffold", "breakdown"].includes(m) ? m : "plan") as Mode;
}

export class TechLeadAgent extends BaseAgent<
  StackPlanOutput | ScaffoldOutput | TicketBreakdownOutput
> {
  readonly role = "TECH_LEAD" as const;
  readonly allowedTools = [
    "Read", "Write", "Edit", "Glob", "Grep", "Bash", "WebFetch",
  ];

  // Fallback — used only if the runtime doesn't pass the input.
  readonly systemPrompt = CORE;

  /**
   * Override: only include the section for the active mode. Cuts ~60%
   * of the system-prompt length vs including all three modes every time.
   */
  protected fullSystemPrompt(input?: Record<string, unknown>): string {
    const mode = resolveMode(input);
    const preamble = super.fullSystemPrompt(input).split("\n\n---\n\n")[0];
    return [preamble, "---", CORE, MODES[mode]].join("\n\n");
  }

  protected outputSchema(): string {
    // Schema is resolved at prompt-build time; subclasses can vary it.
    // BaseAgent.buildPrompt appends this via outputSchema(). We don't
    // have ctx here, so we return all three inline — still much shorter
    // than embedding them in the long system prompt.
    return `Match the schema for your mode:
- plan      → ${OUTPUT_SCHEMAS.plan}
- scaffold  → ${OUTPUT_SCHEMAS.scaffold}
- breakdown → ${OUTPUT_SCHEMAS.breakdown}
Emit the JSON in a fenced \`\`\`json block.`;
  }
}
