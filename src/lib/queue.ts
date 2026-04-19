import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env";

export const connection = new IORedis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const QUEUE_NAMES = {
  AGENTS: "niko.agents",
  ORCHESTRATOR: "niko.orchestrator",
} as const;

export type AgentJobData = {
  runId: string;
  projectId: string;
  role:
    | "PM"
    | "TECH_LEAD"
    | "DEV_WEB"
    | "DEV_MOBILE"
    | "DEV_BACKEND"
    | "DB_EXPERT"
    | "QA";
  ticketId?: string;
  task: string;
  input: Record<string, unknown>;
};

export type OrchestratorJobData = {
  projectId: string;
  event:
    | "INTAKE"
    | "GATE_APPROVED"
    | "GATE_CHANGES_REQUESTED"
    | "PR_MERGED"
    | "PR_REVIEW";
  payload?: Record<string, unknown>;
};

export const agentsQueue = new Queue<AgentJobData>(QUEUE_NAMES.AGENTS, {
  connection,
});

export const orchestratorQueue = new Queue<OrchestratorJobData>(
  QUEUE_NAMES.ORCHESTRATOR,
  { connection },
);

export const agentsQueueEvents = new QueueEvents(QUEUE_NAMES.AGENTS, {
  connection,
});
