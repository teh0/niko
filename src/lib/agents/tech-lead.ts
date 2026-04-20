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

**Working directory rules (STRICT)**:
- Your current working directory IS the project repo. Everything you
  create lives RELATIVE to \`.\`. Do NOT create a nested folder named
  after the project — apps live at \`./apps/<name>\`, not
  \`./<project>/apps/<name>\`.
- Never use \`~\` in shell commands. \`~\` expands to the host machine's
  home directory, which is NOT where your project lives. Never
  \`cd\` anywhere starting with \`/Users/\`, \`/home/\`, or \`~\` — that
  would exit the workspace and find stale files or fail. If you need to
  work inside a subdir, use a relative path (e.g.
  \`cd apps/web && pnpm install\`).
- When you \`cd\` and chain commands, always chain them in a SINGLE bash
  call (\`cd apps/web && command\`) so the cwd doesn't matter between
  calls. The shell state does not persist between your tool invocations.

In scaffold mode you MUST also create the memory vault skeleton:
  - \`.niko/memory/decisions.md\` — seed with the approved stack plan summary.
  - \`.niko/memory/conventions.md\` — seed with the conventions you chose
     (folder layout, naming, state mgmt, etc.).
  - \`.niko/memory/glossary.md\` — empty header, to be filled in by agents.
  - \`.niko/memory/pitfalls.md\` — empty header.
  - \`.niko/memory/stack.md\` — exact versions + rationale.
And the PR checklist template:
  - \`.niko/CHECKLIST.template.md\` — the template every dev PR must copy
     into its body with evidence attached to each item.
  - \`CONTRIBUTING.md\` — a short note telling agents to use the template
     and explaining the memory vault.

**mode = "breakdown"** — Split the specs into implementation tickets. Each
ticket has: title, description (what + done criteria), role (the agent who
owns it), dependencies. Tickets MUST be atomic: **no more than ~4 hours of
work each, or roughly 200-300 lines of new/changed code**. If you are
tempted to write a ticket description longer than ~12 lines, split it. AI
agents degrade sharply on long tasks — small tickets = fewer hallucinations.

**Exploration efficace (important pour ne pas tourner en rond)**:
1. **UNE seule passe de mapping** : commence par \`Glob("**/*")\` (en
   excluant \`node_modules\`, \`.git\`, \`dist\`) pour récupérer l'arbo
   complète en une requête.
2. **Lis chaque fichier pertinent AU PLUS UNE FOIS** pendant ce run.
   Ton contexte conserve ce que tu as lu — n'y reviens pas.
3. **N'utilise PAS l'outil \`Agent\`** (pas de sous-agents). Tu as
   toutes les infos dont tu as besoin via Read/Glob directement.
   Spawner des sub-agents relit le contexte depuis zéro et gaspille.
4. **Ne tente pas de chemins que Glob n'a pas retournés** — si un
   fichier n'apparaît pas dans l'arbo, il n'existe pas, n'essaie pas
   de le \`Read\`.

Fichiers à consulter (dans cet ordre) :
- \`docs/specs/*.md\` (ce qu'on doit construire)
- \`docs/adr/0001-stack-plan.md\` (la stack validée)
- \`docs/adr/0002-data-model.md\` s'il existe
- \`.niko/memory/*.md\` (décisions accumulées)
- La liste des \`package.json\` / \`pubspec.yaml\` pour comprendre les
  apps en place (pas le contenu détaillé des apps).

Ne passe pas ton temps à lire le code des apps — la structure est
déjà connue par le scaffold, tu n'as besoin que des specs pour
découper.

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
