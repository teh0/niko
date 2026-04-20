import type { AgentRole } from "@prisma/client";

export type AgentSnap = {
  role: AgentRole;
  activeStatus?: "RUNNING" | "QUEUED";
  activeRunId?: string;
  activeTask?: string;
  activeTicketTitle?: string;
  lastStatus?: string;
  totalRuns: number;
};

export const ROLE_META: Record<
  AgentRole,
  { label: string; emoji: string; short: string }
> = {
  PM: { label: "Product Manager", emoji: "📋", short: "PM" },
  TECH_LEAD: { label: "Tech Lead", emoji: "🏗️", short: "TL" },
  DEV_WEB: { label: "Dev Web", emoji: "🌐", short: "Web" },
  DEV_MOBILE: { label: "Dev Mobile", emoji: "📱", short: "Mob" },
  DEV_BACKEND: { label: "Dev Backend", emoji: "⚙️", short: "API" },
  DB_EXPERT: { label: "DB Expert", emoji: "🗄️", short: "DB" },
  QA: { label: "QA", emoji: "🔍", short: "QA" },
  RED_TEAM_QA: { label: "Red Team", emoji: "🥷", short: "Red" },
  DEBUG: { label: "Debug", emoji: "🔎", short: "Dbg" },
  INTAKE: { label: "Client Success", emoji: "💬", short: "CS" },
};

export function runLinkFor(
  projectId: string,
  snap: AgentSnap,
): string | null {
  if (snap.activeRunId) return `/projects/${projectId}/runs/${snap.activeRunId}`;
  if (snap.totalRuns > 0) return `/projects/${projectId}/runs?role=${snap.role}`;
  return null;
}
