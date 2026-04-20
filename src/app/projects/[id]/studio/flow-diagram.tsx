"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AgentRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { ROLE_META, runLinkFor, type AgentSnap } from "./shared";

/**
 * Option B — horizontal process flow with animated particles.
 * Reads left-to-right: Brief → PM → Tech Lead → engineers → QA → Red Team.
 * When an agent is working, particles flow INTO them from the previous
 * stage (CSS animation). Feels like a conveyor belt of work.
 */
type Stage = {
  id: string;
  label: string;
  sub?: string;
  roles: AgentRole[];
};

const STAGES: Stage[] = [
  { id: "brief", label: "Brief", sub: "Point de départ", roles: [] },
  { id: "product", label: "Produit", roles: ["PM"] },
  { id: "architecture", label: "Architecture", roles: ["TECH_LEAD", "DB_EXPERT"] },
  {
    id: "build",
    label: "Build",
    roles: ["DEV_WEB", "DEV_MOBILE", "DEV_BACKEND"],
  },
  { id: "quality", label: "Qualité", roles: ["QA", "RED_TEAM_QA", "DEBUG"] },
  { id: "release", label: "Release", sub: "Mergé sur main", roles: [] },
];

export function FlowDiagram({
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

  // A stage is "active" if any of its roles is currently working.
  const stageActive = (s: Stage) =>
    s.roles.some((r) => byRole.get(r)?.activeStatus === "RUNNING");

  return (
    <div className="border border-border rounded-lg bg-background p-6 overflow-x-auto">
      <div className="min-w-[1080px] flex items-stretch gap-2">
        {STAGES.map((stage, i) => {
          const active = stageActive(stage);
          const incomingActive = i > 0 && active;
          return (
            <>
              {i > 0 && (
                <Arrow key={`arr-${i}`} active={incomingActive} />
              )}
              <StageBlock
                key={stage.id}
                stage={stage}
                active={active}
                byRole={byRole}
                projectId={projectId}
              />
            </>
          );
        })}
      </div>
    </div>
  );
}

function StageBlock({
  stage,
  active,
  byRole,
  projectId,
}: {
  stage: Stage;
  active: boolean;
  byRole: Map<AgentRole, AgentSnap>;
  projectId: string;
}) {
  const endpoint = stage.roles.length === 0;
  return (
    <div
      className={cn(
        "flex-1 min-w-[150px] rounded-md border px-3 py-3 transition-all",
        active
          ? "bg-blue-50/50 border-blue-300 shadow-sm"
          : endpoint
            ? "bg-muted/40 border-dashed border-border"
            : "bg-background border-border",
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {stage.label}
        </div>
        {active && (
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75 animate-ping" />
            <span className="relative inline-flex size-2 rounded-full bg-blue-500" />
          </span>
        )}
      </div>
      {stage.sub && (
        <div className="text-[10px] text-muted-foreground mb-2 italic">
          {stage.sub}
        </div>
      )}
      <div className="space-y-1.5">
        {stage.roles.map((role) => {
          const snap = byRole.get(role);
          return (
            <MiniAgent
              key={role}
              role={role}
              snap={snap}
              projectId={projectId}
            />
          );
        })}
      </div>
    </div>
  );
}

function MiniAgent({
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
  const link = snap ? runLinkFor(projectId, snap) : null;

  const row = (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded text-xs border transition-colors",
        isWorking
          ? "bg-white border-blue-300 text-foreground"
          : "bg-white border-border text-muted-foreground",
        link && "hover:border-foreground/30 cursor-pointer",
      )}
    >
      <span className="text-sm">{meta.emoji}</span>
      <span className="font-medium truncate">{meta.label}</span>
      {isWorking && (
        <span className="ml-auto text-[10px] text-blue-600 font-semibold">
          live
        </span>
      )}
    </div>
  );
  return link ? <a href={link}>{row}</a> : row;
}

function Arrow({ active }: { active: boolean }) {
  return (
    <div className="self-center flex items-center w-10 h-10 shrink-0">
      <svg width="40" height="40" viewBox="0 0 40 40">
        <defs>
          <marker
            id={`arr-head-${active ? "on" : "off"}`}
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path
              d="M0,0 L10,5 L0,10 z"
              fill={active ? "hsl(234 89% 60%)" : "hsl(220 13% 70%)"}
            />
          </marker>
        </defs>
        <line
          x1="0"
          y1="20"
          x2="34"
          y2="20"
          stroke={active ? "hsl(234 89% 60%)" : "hsl(220 13% 88%)"}
          strokeWidth={active ? 2 : 1.5}
          markerEnd={`url(#arr-head-${active ? "on" : "off"})`}
        />
        {active && (
          // Animated particle traveling along the line
          <circle r="2.5" fill="hsl(234 89% 60%)">
            <animateMotion dur="1.2s" repeatCount="indefinite">
              <mpath href={`#path-${active ? "on" : "off"}`} />
            </animateMotion>
          </circle>
        )}
        <path
          id={`path-${active ? "on" : "off"}`}
          d="M0,20 L34,20"
          fill="none"
          style={{ display: "none" }}
        />
      </svg>
    </div>
  );
}
