import type { AgentRole } from "@prisma/client";
import { PMAgent } from "./pm";
import { TechLeadAgent } from "./tech-lead";
import { DevWebAgent } from "./dev-web";
import { DevMobileAgent } from "./dev-mobile";
import { DevBackendAgent } from "./dev-backend";
import { DBExpertAgent } from "./db-expert";
import { QAAgent } from "./qa";
import type { BaseAgent } from "./base";

export const AGENTS: Record<AgentRole, BaseAgent> = {
  PM: new PMAgent(),
  TECH_LEAD: new TechLeadAgent(),
  DEV_WEB: new DevWebAgent(),
  DEV_MOBILE: new DevMobileAgent(),
  DEV_BACKEND: new DevBackendAgent(),
  DB_EXPERT: new DBExpertAgent(),
  QA: new QAAgent(),
};

export * from "./base";
export * from "./runtime";
export * from "./workspace";
