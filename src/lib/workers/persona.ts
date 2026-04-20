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

export function buildPRBody(args: {
  role: string;
  task: string;
  finalText: string;
  output: unknown;
  ticketTitle?: string;
  iteration?: number;       // 2+ when it's a revision after CHANGES_REQUESTED
}): string {
  const persona =
    PERSONAS[args.role as PersonaKey] ??
    ({ emoji: "🤖", role: args.role, greet: () => "", signoff: "" } satisfies Persona);

  const greeting =
    args.iteration && args.iteration > 1
      ? `${persona.greet()} *(itération ${args.iteration} — j'ai repris tes retours.)*`
      : persona.greet();

  const summary = args.finalText.slice(0, 4000).trim() || "_(pas de résumé texte)_";

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

---

**Que veux-tu faire ?**

- ✅ **Approuver** — dans le dashboard Niko (ou ici sur GitHub), l'équipe enchaîne immédiatement.
- 💬 **Demander des changements** — précise ce qui doit bouger, je reviens avec une nouvelle version.
- 🗨️ **Discuter** — ouvre le chat dans le dashboard si tu as des questions avant de décider.
${jsonBlock}

${persona.signoff}
`.trim();
}
