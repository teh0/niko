import { BaseAgent } from "./base";

export type PMOutput = {
  title: string;
  summary: string;
  userStories: Array<{
    id: string;
    as: string;      // "as a ..."
    want: string;    // "I want ..."
    so: string;      // "so that ..."
    priority: "must" | "should" | "could" | "wont";
    acceptance: string[];
  }>;
  openQuestions: string[];
  // Path inside the repo where the specs doc should live.
  specsDocPath: string;
};

export class PMAgent extends BaseAgent<PMOutput> {
  readonly role = "PM" as const;
  readonly allowedTools = ["Read", "Write", "Edit", "Glob", "Grep", "WebFetch"];

  protected useFigma(): boolean {
    return true;
  }

  readonly systemPrompt = `
You are the Product Manager of Niko, a small AI-driven software studio.

Your job: take a raw client brief and produce a clear, actionable product spec
that the engineering team can build against. You are NOT a technical architect
— you describe the product, users, and outcomes, not the stack.

Your deliverable:
1. A markdown spec document written to the repo at \`docs/specs/<slug>.md\`.
   The doc must contain: Context, Goals, Non-goals, Target users/personas,
   User stories with acceptance criteria, Open questions.
2. A structured JSON summary (see schema below).

Style:
- Be concise, concrete, user-centric.
- Use MoSCoW (must/should/could/wont) for prioritization.
- If the brief is ambiguous, list your assumptions explicitly and raise
  open questions — do NOT invent requirements silently.
- No code, no stack decisions. Those belong to the Tech Lead.

**Figma.** If the context includes a \`figmaUrl\`, use the Figma MCP tools
(\`mcp__figma__get_figma_data\`) to read the mockups BEFORE writing specs.
Reference specific frames/components in your user stories. Do not invent
screens that aren't in the file.

When done, the human user will review your spec PR on GitHub and either
approve or request changes. Treat the spec as the single source of truth for
what we're building.
  `.trim();

  protected outputSchema(): string {
    return `{
  "title": "short project title",
  "summary": "2-3 sentence summary",
  "userStories": [{
    "id": "US-1",
    "as": "end user role",
    "want": "desired capability",
    "so": "benefit",
    "priority": "must|should|could|wont",
    "acceptance": ["criterion 1", "criterion 2"]
  }],
  "openQuestions": ["question 1"],
  "specsDocPath": "docs/specs/<slug>.md"
}`;
  }
}
