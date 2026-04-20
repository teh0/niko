/**
 * Locale-stable formatting helpers. We lock to 'fr-FR' everywhere so
 * server and client render the same strings (React hydration refuses
 * mismatches between "6 975" and "6,975").
 */

const NUMBER_FMT = new Intl.NumberFormat("fr-FR");
const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "short",
  timeStyle: "short",
});

export function fmtNumber(n: number): string {
  return NUMBER_FMT.format(n);
}

export function fmtDateTime(d: Date | string): string {
  return DATE_FMT.format(new Date(d));
}

/**
 * Human-readable duration. Clamps to 0 if ms is negative — can happen
 * when Postgres (Docker) and the host clock drift after macOS sleep,
 * making startedAt look 'in the future' relative to the host's now.
 */
export function fmtDuration(ms: number): string {
  const n = Math.max(0, ms);
  if (n < 1000) return `${n}ms`;
  const s = Math.floor(n / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
}

/** "il y a Xs/m/h/j". Clamps negative diffs to 0 (clock-skew guard). */
export function fmtRelative(d: Date | string): string {
  const diffMs = Math.max(0, Date.now() - new Date(d).getTime());
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return `il y a ${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `il y a ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `il y a ${h}h`;
  return `il y a ${Math.floor(h / 24)}j`;
}
