"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AgentRole } from "@prisma/client";
import { cn } from "@/lib/utils";
import { ROLE_META, runLinkFor, type AgentSnap } from "./shared";

/**
 * Option C — office floor plan metaphor. Rooms per pole, each agent
 * is a "desk" inside their room. The desk lamp turns on (yellow glow)
 * when the agent is working. More playful, quickly readable.
 */
type Room = {
  id: string;
  label: string;
  wallColor: string;
  labelColor: string;
  roles: AgentRole[];
};

const ROOMS: Room[] = [
  {
    id: "product",
    label: "Produit",
    wallColor: "bg-violet-50 border-violet-200",
    labelColor: "text-violet-700",
    roles: ["PM"],
  },
  {
    id: "leadership",
    label: "Direction tech",
    wallColor: "bg-sky-50 border-sky-200",
    labelColor: "text-sky-700",
    roles: ["TECH_LEAD", "DB_EXPERT"],
  },
  {
    id: "engineering",
    label: "Open space dev",
    wallColor: "bg-emerald-50 border-emerald-200",
    labelColor: "text-emerald-700",
    roles: ["DEV_WEB", "DEV_MOBILE", "DEV_BACKEND"],
  },
  {
    id: "quality",
    label: "Qualité & sécurité",
    wallColor: "bg-amber-50 border-amber-200",
    labelColor: "text-amber-700",
    roles: ["QA", "RED_TEAM_QA", "DEBUG"],
  },
];

export function FloorPlan({
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
    <div className="border border-border rounded-lg bg-muted/30 p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ROOMS.map((room) => (
          <RoomBlock
            key={room.id}
            room={room}
            byRole={byRole}
            projectId={projectId}
          />
        ))}
      </div>
    </div>
  );
}

function RoomBlock({
  room,
  byRole,
  projectId,
}: {
  room: Room;
  byRole: Map<AgentRole, AgentSnap>;
  projectId: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border-2 border-dashed p-5 min-h-[180px]",
        room.wallColor,
      )}
    >
      <div className={cn("text-xs font-semibold uppercase tracking-wider mb-4", room.labelColor)}>
        {room.label}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {room.roles.map((role) => {
          const snap = byRole.get(role);
          return (
            <Desk
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

function Desk({
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

  const desk = (
    <div
      className={cn(
        "relative rounded-lg bg-white border px-3 py-3 transition-all",
        isWorking
          ? "border-amber-300 shadow-[0_0_24px_rgba(251,191,36,0.3)]"
          : isQueued
            ? "border-amber-200 opacity-90"
            : "border-border",
        link && "hover:border-foreground/30 cursor-pointer",
      )}
    >
      {/* Desk lamp glow when the agent is working */}
      {isWorking && (
        <div className="absolute -top-1 -right-1 flex items-center gap-0.5 text-[9px] text-amber-700 bg-amber-100 border border-amber-300 rounded-full px-1.5 py-0.5 font-semibold">
          💡 live
        </div>
      )}
      <div className="text-2xl leading-none mb-1.5">{meta.emoji}</div>
      <div className="text-[12px] font-semibold leading-tight">{meta.label}</div>
      <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2 h-[24px]">
        {isWorking
          ? snap?.activeTicketTitle || snap?.activeTask || "en train de bosser"
          : isQueued
            ? "en attente"
            : (snap?.totalRuns ?? 0) > 0
              ? "pause"
              : "bureau vide"}
      </div>
    </div>
  );

  return link ? <a href={link}>{desk}</a> : desk;
}
