import { BaseAgent } from "./base";

export type StackChoice = {
  web?: { framework: "nextjs"; version?: string; notes?: string };
  mobile?: { framework: "flutter"; version?: string; notes?: string };
  backend?: {
    framework: "nestjs" | "nextjs-api" | "none";
    style?: "monolith" | "microservices";
    services?: string[]; // if microservices
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
  rationale: string;                  // why these choices
  tradeoffs: string[];                // what's being compromised
  adrDocPath: string;                 // where the ADR doc was written
};

export type ScaffoldOutput = {
  rootFiles: string[];                // top-level files/dirs created
  packages: string[];                 // monorepo package paths, if any
  bootstrap: Array<{
    command: string;
    description: string;
  }>;                                 // commands a dev would run to get started
};

export type TicketBreakdownOutput = {
  tickets: Array<{
    title: string;
    description: string;
    role: "DEV_WEB" | "DEV_MOBILE" | "DEV_BACKEND" | "DB_EXPERT" | "QA";
    priority: number;
    dependsOn: string[];              // by title — we'll resolve to ids
    acceptance: string[];
  }>;
};

/**
 * Tech Lead has three modes of operation, toggled via the `mode` field
 * in the input: "plan", "scaffold", "breakdown".
 */
export class TechLeadAgent extends BaseAgent<
  StackPlanOutput | ScaffoldOutput | TicketBreakdownOutput
> {
  readonly role = "TECH_LEAD" as const;
  readonly allowedTools = [
    "Read", "Write", "Edit", "Glob", "Grep", "Bash", "WebFetch",
  ];

  readonly systemPrompt = `
You are the Tech Lead of Niko, a small AI-driven software studio.

You own technical decisions for each project. Your standing conventions:

• Web front: **Next.js** (App Router, TypeScript).
• Mobile: **Flutter** (latest stable).
• Heavy/complex backend: **NestJS**, microservices style.
• Light backend: Next.js API routes are fine.
• Default monorepo tool: **Turborepo + pnpm**.
• Default DB: **Postgres + Prisma** unless the DB Expert overrides.
• Always include CI scaffolding (GitHub Actions) proportional to the stack.

You operate in one of three modes per run (see 'mode' in the context):

**mode = "plan"** — Read the PM specs (docs/specs/*.md), then write a Stack
Plan ADR at \`docs/adr/0001-stack-plan.md\`. The ADR must justify EVERY major
choice (monorepo vs single, NestJS vs Next API, SQL vs NoSQL, etc.) against
the specs. Output the structured StackPlan JSON.

**mode = "scaffold"** — Once the plan is approved, scaffold the repo. Create
directories, config files, package.json(s), tsconfig, turbo.json if monorepo,
pubspec.yaml if Flutter, nest-cli.json if NestJS, .gitignore, CI yaml. Do NOT
implement features — just a working, buildable skeleton with a hello-world
in each app. Output the Scaffold JSON.

**mode = "breakdown"** — Split the specs into implementation tickets. Each
ticket has: title, description (what + done criteria), role (the agent who
owns it), dependencies. Tickets should be small enough to fit one PR.

Be decisive. If specs are ambiguous, pick the most defensible option and note
why — the human will push back on the PR if wrong.
  `.trim();

  protected outputSchema(): string {
    return `depends on mode:
- mode=plan → { decision, rationale, tradeoffs, adrDocPath }
- mode=scaffold → { rootFiles, packages, bootstrap }
- mode=breakdown → { tickets: [{title, description, role, priority, dependsOn, acceptance}] }
Output the matching object in a fenced \`\`\`json block.`;
  }
}
