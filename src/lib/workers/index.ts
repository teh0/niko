/**
 * Worker entrypoint — run with `pnpm worker`.
 * Keeps the agent + orchestrator workers alive in a single process.
 */

import { startAgentWorker } from "./agent-worker";
import { startOrchestratorWorker } from "./orchestrator-worker";

async function main() {
  const agent = startAgentWorker();
  const orch = startOrchestratorWorker();

  console.info("[niko] workers online");
  console.info(`[niko] concurrency: ${process.env.MAX_CONCURRENT_AGENTS ?? 4}`);

  const shutdown = async (sig: string) => {
    console.info(`[niko] ${sig} received, draining…`);
    await Promise.all([agent.close(), orch.close()]);
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[niko] worker bootstrap failed:", err);
  process.exit(1);
});
