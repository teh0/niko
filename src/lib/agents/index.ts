import type { AgentRole } from "@prisma/client";
import { PMAgent } from "./pm";
import { TechLeadAgent } from "./tech-lead";
import { DevWebAgent } from "./dev-web";
import { DevMobileAgent } from "./dev-mobile";
import { DevBackendAgent } from "./dev-backend";
import { DBExpertAgent } from "./db-expert";
import { QAAgent } from "./qa";
import { RedTeamQAAgent } from "./red-team-qa";
import { DebugAgent } from "./debug";
import type { BaseAgent } from "./base";

// The INTAKE agent runs inline on HTTP requests (pure chat, no workspace),
// not through the worker queue — so it's not in this registry.
export type WorkerRole = Exclude<AgentRole, "INTAKE">;

export const AGENTS: Record<WorkerRole, BaseAgent> = {
  PM: new PMAgent(),
  TECH_LEAD: new TechLeadAgent(),
  DEV_WEB: new DevWebAgent(),
  DEV_MOBILE: new DevMobileAgent(),
  DEV_BACKEND: new DevBackendAgent(),
  DB_EXPERT: new DBExpertAgent(),
  QA: new QAAgent(),
  RED_TEAM_QA: new RedTeamQAAgent(),
  DEBUG: new DebugAgent(),
};

export * from "./base";
export * from "./runtime";
export * from "./workspace";
