"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AgentRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { ROLE_META, runLinkFor, type AgentSnap } from "./shared";

/**
 * Option A — classic top-down org chart drawn with CSS grid + SVG
 * connectors. Minimalist: clean hierarchy, no animation. Best for
 * "who reports to whom" mental model.
 */
export function OrgChart({
  projectId,
  agents,
}: {
  projectId: string;
  agents: AgentSnap[];
}) {
  const router = useRouter();
  const byRole = new Map(agents.map((a) => [a.role, a]));
  const anyActive = agents.some((a) => a.activeStatus === "RUNNING");

  useEffect(() => {
    if (!anyActive) return;
    const id = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(id);
  }, [anyActive, router]);

  return (
    <div className="border border-border rounded-lg bg-background p-8 overflow-x-auto">
      <div className="min-w-[900px] mx-auto">
        {/* Row 1: PM (top of hierarchy) */}
        <Row>
          <Pod role="PM" snap={byRole.get("PM")} projectId={projectId} />
        </Row>
        <Connector />

        {/* Row 2: Tech Lead (reports to PM) */}
        <Row>
          <Pod role="TECH_LEAD" snap={byRole.get("TECH_LEAD")} projectId={projectId} />
        </Row>
        <Connector />

        {/* Row 3: Engineers (report to Tech Lead) */}
        <Row cols={4}>
          <Pod role="DB_EXPERT" snap={byRole.get("DB_EXPERT")} projectId={projectId} />
          <Pod role="DEV_WEB" snap={byRole.get("DEV_WEB")} projectId={projectId} />
          <Pod role="DEV_MOBILE" snap={byRole.get("DEV_MOBILE")} projectId={projectId} />
          <Pod role="DEV_BACKEND" snap={byRole.get("DEV_BACKEND")} projectId={projectId} />
        </Row>
        <Connector />

        {/* Row 4: Quality (reports to Tech Lead, independent from engineers) */}
        <Row cols={3}>
          <Pod role="QA" snap={byRole.get("QA")} projectId={projectId} />
          <Pod role="RED_TEAM_QA" snap={byRole.get("RED_TEAM_QA")} projectId={projectId} />
          <Pod role="DEBUG" snap={byRole.get("DEBUG")} projectId={projectId} />
        </Row>
      </div>
    </div>
  );
}

function Row({
  cols = 1,
  children,
}: {
  cols?: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="grid gap-4 justify-items-center"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

function Connector() {
  return (
    <div className="relative h-8 w-full flex items-center justify-center">
      <div className="w-px h-full bg-border" />
      <div className="absolute inset-x-8 h-px bg-border top-1/2" />
    </div>
  );
}

function Pod({
  role,
  snap,
  projectId,
}: {
  role: AgentRole;
  snap?: AgentSnap;
  projectId: string;
}) {
  const meta = ROLE_META[role];
  const isWorking = snap?.activeStatus === "RUNNING";
  const isQueued = snap?.activeStatus === "QUEUED";
  const link = snap ? runLinkFor(projectId, snap) : null;

  const node = (
    <div
      className={cn(
        "relative w-[200px] rounded-md border bg-background px-4 py-3 text-center transition-all",
        isWorking && "border-blue-400 ring-2 ring-blue-100 shadow-sm",
        isQueued && "border-amber-300 ring-2 ring-amber-50",
        !isWorking && !isQueued && "border-border",
        link && "hover:border-foreground/30 cursor-pointer",
      )}
    >
      {isWorking && (
        <span className="absolute -top-1 -right-1 flex size-3">
          <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 animate-ping" />
          <span className="relative inline-flex size-3 rounded-full bg-blue-500" />
        </span>
      )}
      <div className="text-2xl mb-1">{meta.emoji}</div>
      <div className="text-sm font-semibold">{meta.label}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
        {isWorking
          ? "en train de bosser"
          : isQueued
            ? "en attente"
            : (snap?.totalRuns ?? 0) > 0
              ? "disponible"
              : "pas encore sollicité"}
      </div>
    </div>
  );

  return link ? <a href={link}>{node}</a> : node;
}
