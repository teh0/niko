import { Queue, QueueEvents } from "bullmq";
import IORedis from "ioredis";
import { env } from "./env";

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
    | "QA"
    | "RED_TEAM_QA"
    | "DEBUG";
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

// Lazy singletons — constructing a Redis connection or a BullMQ Queue at
// module load time fails Next.js build (env vars not ready). We defer until
// first use; by then we're either in a dev/prod server process or a worker,
// both of which have env properly loaded.

let _connection: IORedis | null = null;
export function getConnection(): IORedis {
  if (!_connection) {
    _connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return _connection;
}

let _agentsQueue: Queue<AgentJobData> | null = null;
export function getAgentsQueue(): Queue<AgentJobData> {
  if (!_agentsQueue) {
    _agentsQueue = new Queue<AgentJobData>(QUEUE_NAMES.AGENTS, {
      connection: getConnection(),
    });
  }
  return _agentsQueue;
}

let _orchestratorQueue: Queue<OrchestratorJobData> | null = null;
export function getOrchestratorQueue(): Queue<OrchestratorJobData> {
  if (!_orchestratorQueue) {
    _orchestratorQueue = new Queue<OrchestratorJobData>(
      QUEUE_NAMES.ORCHESTRATOR,
      { connection: getConnection() },
    );
  }
  return _orchestratorQueue;
}

let _agentsQueueEvents: QueueEvents | null = null;
export function getAgentsQueueEvents(): QueueEvents {
  if (!_agentsQueueEvents) {
    _agentsQueueEvents = new QueueEvents(QUEUE_NAMES.AGENTS, {
      connection: getConnection(),
    });
  }
  return _agentsQueueEvents;
}
