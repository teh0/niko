import { notFound } from "next/navigation";
import { Users } from "lucide-react";
import type { AgentRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { AutoRefresh } from "../runs/auto-refresh";
import { StudioBlueprint } from "./blueprint";

export const dynamic = "force-dynamic";

// Worker roles only — INTAKE runs inline in the web app, not via the queue.
const STUDIO_ROLES: AgentRole[] = [
  "PM",
  "TECH_LEAD",
  "DEV_WEB",
  "DEV_MOBILE",
  "DEV_BACKEND",
  "DB_EXPERT",
  "QA",
  "RED_TEAM_QA",
  "DEBUG",
];

export default async function StudioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      agentRuns: { orderBy: { createdAt: "desc" }, take: 100 },
      tickets: true,
    },
  });
  if (!project) notFound();

  // Per-role snapshot: active work + recent history.
  const agents = STUDIO_ROLES.map((role) => {
    const runs = project.agentRuns.filter((r) => r.role === role);
    const active = runs.find((r) => r.status === "RUNNING" || r.status === "QUEUED");
    const lastFinished = runs.find(
      (r) => r.status === "SUCCEEDED" || r.status === "FAILED",
    );
    const ticket = active?.ticketId
      ? project.tickets.find((t) => t.id === active.ticketId)
      : undefined;
    return {
      role,
      activeStatus: active?.status as "RUNNING" | "QUEUED" | undefined,
      activeRunId: active?.id,
      activeTask: active?.task,
      activeTicketTitle: ticket?.title,
      lastStatus: lastFinished?.status,
      totalRuns: runs.length,
    };
  });

  const anyActive = agents.some((a) => a.activeStatus === "RUNNING");
  const activeCount = agents.filter((a) => a.activeStatus === "RUNNING").length;

  return (
    <div className="px-8 py-8">
      {anyActive && <AutoRefresh intervalMs={3000} />}

      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="size-6 text-muted-foreground" />
            Studio
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Les agents, leurs tâches en cours et leurs collaborations en temps réel.
            {anyActive && " Mise à jour toutes les 2,5 s."}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-3xl font-semibold tabular-nums">{activeCount}</div>
          <div className="text-xs text-muted-foreground">
            agent{activeCount > 1 ? "s" : ""} en activité
          </div>
        </div>
      </header>

      <StudioBlueprint projectId={id} agents={agents} />
    </div>
  );
}
