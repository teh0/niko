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
