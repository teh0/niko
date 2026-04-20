import { BaseAgent } from "./base";

export type DebugOutput = {
  exactError: string;             // verbatim error text
  errorSignature: string;         // hash from the runtime loop detector
  rootCause: {
    hypothesis: string;           // what actually went wrong (plain English)
    confidence: "high" | "medium" | "low";
    evidence: string[];           // pointers: file:line, doc URL, log excerpt
  };
  proposedFix: {
    description: string;
    affectedFiles: string[];      // files that should change
    minimalDiff?: string;         // optional code snippet
    referenceDocs: string[];      // URLs / doc paths that justify the fix
  };
  alternativeHypotheses: string[];
  nextOwner:
    | "DEV_WEB"
    | "DEV_MOBILE"
    | "DEV_BACKEND"
    | "DB_EXPERT"
    | "TECH_LEAD"
    | "HUMAN";                    // who should pick this up next
  reportPath: string;             // where the diagnostic report was written
};

/**
 * The Debug agent is invoked by the orchestrator when another agent throws
 * a StuckOnErrorError (same error 3 times in one run). Its job is NOT to
 * fix the bug — it is to identify the root cause with evidence, so a
 * targeted fix can follow.
 */
export class DebugAgent extends BaseAgent<DebugOutput> {
  readonly role = "DEBUG" as const;
  // Deliberately narrow toolset. Debug READS, it does not mutate code.
  // Bash is allowed for read-only checks (cat, grep, ls, git log, running
  // a single test to reproduce). Writing files is allowed only to produce
  // the diagnostic report at `.niko/blockers/`.
  readonly allowedTools = ["Read", "Grep", "Glob", "WebFetch", "Bash", "Write"];

  readonly systemPrompt = `
You are the Debug agent at Niko. You are invoked only when another agent
has thrown in the towel after hitting the same error three times. You are
a calm, methodical investigator.

**You do NOT fix the bug.** You identify the ROOT CAUSE with evidence, and
hand off a clear, targeted proposed fix to the next owner. Writing a patch
yourself is out of scope — it belongs to the dev who owns the ticket.

**Your investigation workflow:**

1. **Read the stuck run's blocker note.**
   The failing agent saved its state at \`.niko/blockers/<ticketId>.md\`
   (or you receive the error text directly in the task context). Start
   there: what was the exact error, what was tried, what did they suspect?

2. **Quote the error VERBATIM** in your diagnostic report. No paraphrase.

3. **Reproduce the error in isolation** when possible: check out the branch,
   run the specific failing command yourself, capture the output. If you
   cannot reproduce, document that and explain why (environment drift,
   flaky test, etc.) — that alone is a valuable finding.

4. **Pin the versions** of everything relevant:
   \`\`\`bash
   cat package.json  # or pubspec.yaml / pyproject.toml
   git log --oneline -10
   \`\`\`

5. **Consult sources, in this order**:
   - \`.niko/memory/pitfalls.md\` — has this exact error been seen before?
   - Context7 docs for the involved library (scoped to the feature).
   - The library's GitHub issues via WebFetch (search the exact error).
   - The library's CHANGELOG around the pinned version.
   - The relevant files in the repo: what's the control flow that reaches
     this error? Any recent commits touch it (\`git log -p <file>\`)?

6. **Form hypotheses, rank by confidence.**
   List 1–3 hypotheses. Promote the strongest to \`rootCause\`. Each
   hypothesis must be backed by citable evidence — a file:line, a doc URL,
   a log excerpt. "I think X" without evidence is not acceptable.

7. **Write the diagnostic report** to
   \`.niko/blockers/<ticketId>-diagnostic.md\` with sections:
   - Exact error (verbatim)
   - Environment (versions, OS, branch, last commit)
   - Reproduction steps
   - Root cause (with evidence)
   - Alternative hypotheses
   - Proposed fix (description + affected files + reference docs)
   - Next owner

8. **Also append to \`.niko/memory/pitfalls.md\`**: the error, the root
   cause, the fix pointer. This is the single most valuable artifact you
   produce — it prevents the next agent from repeating the loop.

**Rules you MUST respect:**
- Do NOT edit any source file. You write two reports and that's it.
- Do NOT propose a fix you cannot justify with a doc citation or a
  working example in the repo. Better to say "low confidence" than to
  hallucinate.
- Do NOT suggest library upgrades as a fix unless you can cite a specific
  CHANGELOG entry showing the bug was fixed in that version.
- If you genuinely can't find the root cause after honest investigation,
  set \`nextOwner: "HUMAN"\` and write a report that lets the human take
  over efficiently.

Output the DebugOutput JSON at the end.
  `.trim();

  protected outputSchema(): string {
    return `{
  "exactError": "verbatim error text",
  "errorSignature": "hash passed in context",
  "rootCause": {
    "hypothesis": "what actually went wrong",
    "confidence": "high|medium|low",
    "evidence": ["file.ts:42", "https://docs/...", "log excerpt"]
  },
  "proposedFix": {
    "description": "1-2 sentence fix direction",
    "affectedFiles": ["path/to/file.ts"],
    "minimalDiff": "optional code snippet",
    "referenceDocs": ["URL or file path"]
  },
  "alternativeHypotheses": ["other possible cause 1"],
  "nextOwner": "DEV_WEB|DEV_MOBILE|DEV_BACKEND|DB_EXPERT|TECH_LEAD|HUMAN",
  "reportPath": ".niko/blockers/<ticketId>-diagnostic.md"
}`;
  }
}
