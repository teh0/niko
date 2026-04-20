/**
 * Persona + French rendering for PR titles, commit messages, and bodies.
 *
 * Agents think in English (their system prompts are in English for quality),
 * but the human reviewer is French — so what they SHIP to GitHub should be
 * French and feel human, not like a bot template.
 */

export type PersonaKey =
  | "PM"
  | "TECH_LEAD"
  | "DEV_WEB"
  | "DEV_MOBILE"
  | "DEV_BACKEND"
  | "DB_EXPERT"
  | "QA"
  | "RED_TEAM_QA"
  | "DEBUG";

type Persona = {
  emoji: string;
  role: string;              // display name in FR
  signoff: string;           // sign-off line at the bottom
  greet: () => string;       // opening line
};

const PERSONAS: Record<PersonaKey, Persona> = {
  PM: {
    emoji: "📋",
    role: "Product Manager",
    signoff: "— ton PM",
    greet: () => "Salut ! J'ai travaillé sur la phase de cadrage.",
  },
  TECH_LEAD: {
    emoji: "🏗️",
    role: "Tech Lead",
    signoff: "— ton Tech Lead",
    greet: () => "Salut ! Voici ma proposition technique.",
  },
  DEV_WEB: {
    emoji: "🌐",
    role: "Dev Web",
    signoff: "— le Dev Web",
    greet: () => "Salut ! J'ai avancé sur le front web.",
  },
  DEV_MOBILE: {
    emoji: "📱",
    role: "Dev Mobile",
    signoff: "— le Dev Mobile",
    greet: () => "Salut ! J'ai bossé sur l'app Flutter.",
  },
  DEV_BACKEND: {
    emoji: "⚙️",
    role: "Dev Backend",
    signoff: "— le Dev Backend",
    greet: () => "Salut ! Voici l'implémentation côté API.",
  },
  DB_EXPERT: {
    emoji: "🗄️",
    role: "DB Expert",
    signoff: "— le DB Expert",
    greet: () => "Salut ! Voici le modèle de données que je propose.",
  },
  QA: {
    emoji: "🔍",
    role: "QA",
    signoff: "— ton QA",
    greet: () => "Salut ! J'ai fini ma revue de qualité.",
  },
  RED_TEAM_QA: {
    emoji: "🥷",
    role: "Red Team",
    signoff: "— Red Team",
    greet: () => "Salut ! J'ai essayé de casser le code. Verdict :",
  },
  DEBUG: {
    emoji: "🔎",
    role: "Debug",
    signoff: "— Debug",
    greet: () => "Salut ! J'ai enquêté sur le blocage. Mon analyse :",
  },
};

/**
 * Short, human-friendly PR/commit title based on the gate kind or role.
 * Falls back to a truncated task if no better mapping applies.
 */
export function frenchTitle(
  role: string,
  task: string,
  input: Record<string, unknown>,
  ticketTitle?: string,
): string {
  const persona = PERSONAS[role as PersonaKey];
  const emoji = persona?.emoji ?? "🤖";

  // Gate-level PRs — fixed labels per kind.
  if (role === "PM") {
    return `${emoji} Specs du projet`;
  }
  if (role === "TECH_LEAD") {
    const mode = input.mode as string | undefined;
    if (mode === "plan") return `${emoji} Proposition de stack technique`;
    if (mode === "scaffold") return `${emoji} Mise en place du repo`;
    if (mode === "breakdown") return `${emoji} Découpage en tickets`;
  }
  if (role === "DB_EXPERT") {
    return `${emoji} Modèle de données`;
  }
  if (role === "QA" && input.mode === "signoff") {
    return `${emoji} QA · validation finale`;
  }
  if (role === "RED_TEAM_QA") {
    return `${emoji} Red Team · revue d'attaque`;
  }
  if (role === "DEBUG") {
    return `${emoji} Diagnostic`;
  }

  // Feature tickets (DEV_*). Prefer the ticket title if we have it.
  if (ticketTitle) {
    return `${emoji} ${ticketTitle.slice(0, 68)}`;
  }

  return `${emoji} ${task.slice(0, 68)}`;
}

/** Single-line commit subject, same title (used in the git commit message). */
export function frenchCommitSubject(
  role: string,
  task: string,
  input: Record<string, unknown>,
  ticketTitle?: string,
): string {
  return frenchTitle(role, task, input, ticketTitle);
}

export type DiffSummaryLite = {
  filesChanged: number;
  insertions: number;
  deletions: number;
  byFile: Array<{ path: string; insertions: number; deletions: number }>;
};

export function buildPRBody(args: {
  role: string;
  task: string;
  finalText: string;
  output: unknown;
  ticketTitle?: string;
  iteration?: number;       // 2+ when it's a revision after CHANGES_REQUESTED
  diff?: DiffSummaryLite | null;
}): string {
  const persona =
    PERSONAS[args.role as PersonaKey] ??
    ({ emoji: "🤖", role: args.role, greet: () => "", signoff: "" } satisfies Persona);

  const greeting =
    args.iteration && args.iteration > 1
      ? `${persona.greet()} *(itération ${args.iteration} — j'ai repris tes retours.)*`
      : persona.greet();

  // Isolate the agent's recap from the trailing JSON block (if any) —
  // the JSON goes into a <details>, prose stays in the body.
  const { prose } = splitRecapFromJson(args.finalText);
  const summary = prose.slice(0, 6000).trim() || "_(pas de résumé texte fourni)_";

  const diffBlock = args.diff ? formatDiffBlock(args.diff) : "";

  const jsonBlock = args.output
    ? `
<details>
<summary>📎 Données structurées <sub>(utilisé par l'orchestrateur)</sub></summary>

\`\`\`json
${JSON.stringify(args.output, null, 2)}
\`\`\`

</details>`
    : "";

  return `
${greeting}

${summary}

${diffBlock}

---

**Que veux-tu faire ?**

- ✅ **Approuver** — dans le dashboard Niko (ou ici sur GitHub), l'équipe enchaîne immédiatement.
- 💬 **Demander des changements** — précise ce qui doit bouger, je reviens avec une nouvelle version.
- 🗨️ **Discuter** — ouvre le chat dans le dashboard si tu as des questions avant de décider.
${jsonBlock}

${persona.signoff}
`.trim();
}

function splitRecapFromJson(finalText: string): { prose: string } {
  // Remove trailing ```json ... ``` fence so it doesn't show twice.
  const stripped = finalText.replace(/```json\s*[\s\S]*?```\s*$/g, "").trim();
  return { prose: stripped };
}

/**
 * Render the diff as a compact '📂 Fichiers modifiés' section with
 * grouped counts. Long file lists collapse into a <details>.
 */
function formatDiffBlock(d: DiffSummaryLite): string {
  if (d.filesChanged === 0) return "";

  const header = `**📂 Fichiers modifiés** — ${d.filesChanged} fichier${d.filesChanged > 1 ? "s" : ""}, +${d.insertions} / −${d.deletions}`;

  // Group by top-level folder to keep the preview readable.
  const groups = new Map<string, { files: number; ins: number; del: number }>();
  for (const f of d.byFile) {
    const top = f.path.split("/")[0] || "(root)";
    const g = groups.get(top) ?? { files: 0, ins: 0, del: 0 };
    g.files += 1;
    g.ins += f.insertions;
    g.del += f.deletions;
    groups.set(top, g);
  }
  const groupLines = Array.from(groups.entries())
    .sort(([, a], [, b]) => b.files - a.files)
    .slice(0, 10)
    .map(
      ([top, g]) =>
        `- \`${top}/\` — ${g.files} fichier${g.files > 1 ? "s" : ""} (+${g.ins} / −${g.del})`,
    )
    .join("\n");

  const fullList =
    d.byFile.length > 20
      ? `\n\n<details>\n<summary>Voir les ${d.byFile.length} fichiers en détail</summary>\n\n${d.byFile
          .slice(0, 200)
          .map((f) => `- \`${f.path}\` (+${f.insertions} / −${f.deletions})`)
          .join("\n")}${d.byFile.length > 200 ? `\n- _(+${d.byFile.length - 200} autres)_` : ""}\n\n</details>`
      : `\n\n${d.byFile
          .map((f) => `- \`${f.path}\` (+${f.insertions} / −${f.deletions})`)
          .join("\n")}`;

  return `---\n\n${header}\n\n${groupLines}${fullList}`;
}
