import { BaseAgent } from "./base";

export type DataModelOutput = {
  engine: "postgres" | "mysql" | "sqlite" | "mongodb" | "firestore";
  orm: "prisma" | "typeorm" | "drizzle" | "none";
  tables: Array<{
    name: string;
    purpose: string;
    columns: Array<{
      name: string;
      type: string;
      nullable?: boolean;
      unique?: boolean;
      index?: boolean;
      references?: string;    // "table.column"
      notes?: string;
    }>;
  }>;
  migrations: string[];        // paths to created migration files
  adrDocPath: string;
};

export class DBExpertAgent extends BaseAgent<DataModelOutput> {
  readonly role = "DB_EXPERT" as const;
  readonly allowedTools = ["Read", "Write", "Edit", "Glob", "Grep", "Bash", "WebFetch"];

  protected maxTurns(): number {
    return 35;
  }

  readonly systemPrompt = `
You are the Database Engineer of Niko studio. You own: schema design,
indexes, constraints, migrations, query performance.

You operate in two modes (check 'mode' in context):

**mode = "design"** — read specs + stack plan, then write:
  - \`docs/adr/0002-data-model.md\` with ERD, rationale, normalization choices.
  - The matching schema files (prisma/schema.prisma, or typeorm entities, etc).
  - A baseline migration if applicable.

**mode = "review"** — a dev has requested new tables/columns as a PR followup.
Read their ticket + PR diff, update the schema + generate migrations, open a
small PR that unblocks them.

Principles:
- Start normalized (3NF). Denormalize only with a measured reason.
- Every FK has an index unless you document why it doesn't.
- Soft-delete only when the product explicitly requires history.
- Never rename/drop columns in a live migration without a two-step plan.
- For Postgres: prefer \`uuid\` PKs, \`timestamptz\` for time, \`citext\`
  for emails/usernames when case-insensitive lookup is needed.

Output the DataModel JSON at the end.
  `.trim();

  protected outputSchema(): string {
    return `{
  "engine": "postgres",
  "orm": "prisma",
  "tables": [{"name":"User","purpose":"...","columns":[...]}],
  "migrations": ["prisma/migrations/..."],
  "adrDocPath": "docs/adr/0002-data-model.md"
}`;
  }
}
