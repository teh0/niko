"use client";

import { useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { AgentRole } from "@prisma/client";
import { cn } from "@/lib/utils";

type AgentSnap = {
  role: AgentRole;
  activeStatus?: "RUNNING" | "QUEUED";
  activeRunId?: string;
  activeTask?: string;
  activeTicketTitle?: string;
  lastStatus?: string;
  totalRuns: number;
};

export type BlueprintProps = {
  projectId: string;
  agents: AgentSnap[];
};

/**
 * Live org-chart / flow view of the studio. Each agent is a node; edges
 * model the typical collaboration flow (PM feeds Tech Lead, Tech Lead
 * feeds devs, devs feed QA → Red Team, any agent can fall back to Debug).
 *
 * Active nodes pulse blue. Edges leading INTO an active node get animated
 * dashes so you can visually follow 'who the work just came from'.
 */
export function StudioBlueprint({ projectId, agents }: BlueprintProps) {
  const router = useRouter();

  // Auto-refresh the server component every 2.5s when anything is running
  // so the graph updates live.
  const anyActive = agents.some((a) => a.activeStatus === "RUNNING");
  useEffect(() => {
    if (!anyActive) return;
    const id = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(id);
  }, [anyActive, router]);

  const byRole = useMemo(() => {
    const m = new Map<AgentRole, AgentSnap>();
    for (const a of agents) m.set(a.role, a);
    return m;
  }, [agents]);

  const isActive = (r: AgentRole) => byRole.get(r)?.activeStatus === "RUNNING";

  // Fixed layout — clear top-to-bottom flow of value through the studio.
  const nodes: Node<NodeData>[] = useMemo(
    () => [
      node("PM", "Product Manager", "📋", 360, 20, byRole.get("PM"), projectId),
      node("TECH_LEAD", "Tech Lead", "🏗️", 360, 160, byRole.get("TECH_LEAD"), projectId),
      node("DB_EXPERT", "DB Expert", "🗄️", 80, 160, byRole.get("DB_EXPERT"), projectId),
      node("DEV_WEB", "Dev Web", "🌐", 40, 320, byRole.get("DEV_WEB"), projectId),
      node("DEV_MOBILE", "Dev Mobile", "📱", 290, 320, byRole.get("DEV_MOBILE"), projectId),
      node("DEV_BACKEND", "Dev Backend", "⚙️", 540, 320, byRole.get("DEV_BACKEND"), projectId),
      node("QA", "QA", "🔍", 360, 480, byRole.get("QA"), projectId),
      node("RED_TEAM_QA", "Red Team", "🥷", 640, 480, byRole.get("RED_TEAM_QA"), projectId),
      node("DEBUG", "Debug", "🔎", 80, 480, byRole.get("DEBUG"), projectId),
    ],
    [byRole, projectId],
  );

  const edges: Edge[] = useMemo(() => {
    const edgeDefs: Array<[AgentRole, AgentRole]> = [
      ["PM", "TECH_LEAD"],
      ["TECH_LEAD", "DB_EXPERT"],
      ["TECH_LEAD", "DEV_WEB"],
      ["TECH_LEAD", "DEV_MOBILE"],
      ["TECH_LEAD", "DEV_BACKEND"],
      ["DB_EXPERT", "DEV_BACKEND"],
      ["DEV_WEB", "QA"],
      ["DEV_MOBILE", "QA"],
      ["DEV_BACKEND", "QA"],
      ["QA", "RED_TEAM_QA"],
      ["DEV_WEB", "DEBUG"],
      ["DEV_BACKEND", "DEBUG"],
    ];
    return edgeDefs.map(([src, dst]) => {
      const active = isActive(dst); // the edge INTO an active agent lights up
      return {
        id: `${src}->${dst}`,
        source: src,
        target: dst,
        animated: active,
        style: {
          stroke: active ? "hsl(234 89% 60%)" : "hsl(220 13% 88%)",
          strokeWidth: active ? 2 : 1.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: active ? "hsl(234 89% 60%)" : "hsl(220 13% 70%)",
        },
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byRole]);

  return (
    <div className="w-full h-[640px] border border-border rounded-lg overflow-hidden bg-background">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        onNodeClick={(_e, node) => {
          router.push(`/projects/${projectId}/runs?role=${node.id}`);
        }}
      >
        <Background gap={20} size={1.2} color="hsl(220 13% 93%)" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

type NodeData = {
  role: AgentRole;
  label: string;
  emoji: string;
  snap?: AgentSnap;
  projectId: string;
};

function node(
  role: AgentRole,
  label: string,
  emoji: string,
  x: number,
  y: number,
  snap: AgentSnap | undefined,
  projectId: string,
): Node<NodeData> {
  return {
    id: role,
    type: "agent",
    position: { x, y },
    data: { role, label, emoji, snap, projectId },
  };
}

const NODE_TYPES = { agent: AgentNode };

type NodeState = "working" | "queued" | "failed" | "succeeded" | "idle";

function agentState(snap?: AgentSnap): NodeState {
  if (snap?.activeStatus === "RUNNING") return "working";
  if (snap?.activeStatus === "QUEUED") return "queued";
  if (!snap || snap.totalRuns === 0) return "idle";
  if (snap.lastStatus === "FAILED") return "failed";
  if (snap.lastStatus === "SUCCEEDED") return "succeeded";
  return "idle";
}

const STATE_STYLE: Record<
  NodeState,
  { box: string; label: string; labelText: string; glyph: React.ReactNode | null }
> = {
  working: {
    box: "border-2 border-blue-500 bg-white ring-4 ring-blue-100 shadow-lg shadow-blue-200/60",
    label: "text-blue-700",
    labelText: "en cours",
    glyph: (
      <span className="absolute -top-1.5 -right-1.5 flex size-3.5">
        <span className="absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-60 animate-ping" />
        <span className="relative inline-flex size-3.5 rounded-full bg-blue-500 ring-2 ring-white" />
      </span>
    ),
  },
  queued: {
    box: "border-2 border-amber-400 border-dashed bg-amber-50/50 ring-2 ring-amber-100",
    label: "text-amber-700",
    labelText: "en attente",
    glyph: (
      <span className="absolute -top-1.5 -right-1.5 size-3.5 rounded-full bg-amber-400 ring-2 ring-white" />
    ),
  },
  failed: {
    box: "border-2 border-red-400 bg-red-50/40 ring-2 ring-red-100",
    label: "text-red-700",
    labelText: "dernier run : échec",
    glyph: (
      <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center size-4 rounded-full bg-red-500 text-white text-[10px] ring-2 ring-white font-bold">
        !
      </span>
    ),
  },
  succeeded: {
    box: "border border-emerald-300 bg-white",
    label: "text-emerald-700",
    labelText: "disponible",
    glyph: (
      <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center size-4 rounded-full bg-emerald-500 text-white text-[10px] ring-2 ring-white">
        ✓
      </span>
    ),
  },
  idle: {
    box: "border border-dashed border-border bg-muted/20 opacity-80",
    label: "text-muted-foreground",
    labelText: "pas encore sollicité",
    glyph: null,
  },
};

function AgentNode({ data }: NodeProps<Node<NodeData>>) {
  const snap = data.snap;
  const state = agentState(snap);
  const style = STATE_STYLE[state];

  return (
    <div
      className={cn(
        "relative rounded-xl px-3.5 py-2.5 min-w-[190px] transition-all cursor-pointer hover:border-foreground/40",
        style.box,
      )}
    >
      {style.glyph}

      <Handle
        type="target"
        position={Position.Top}
        style={{ opacity: 0, pointerEvents: "none" }}
      />

      <div className="flex items-center gap-2">
        <div className="size-8 rounded-md bg-background border border-border flex items-center justify-center text-base shrink-0">
          {data.emoji}
        </div>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold truncate">{data.label}</div>
          <div
            className={cn(
              "text-[10px] uppercase tracking-wider font-medium",
              style.label,
            )}
          >
            {style.labelText}
          </div>
        </div>
      </div>

      {state === "working" && snap?.activeTask && (
        <div className="mt-2 pt-2 border-t border-blue-200/60">
          <div className="text-[11px] text-foreground/80 line-clamp-2 leading-snug">
            {snap.activeTicketTitle ?? snap.activeTask}
          </div>
        </div>
      )}

      {snap && snap.totalRuns > 0 && state !== "working" && (
        <div className="mt-1.5 text-[10px] text-muted-foreground tabular-nums">
          {snap.totalRuns} run{snap.totalRuns > 1 ? "s" : ""}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ opacity: 0, pointerEvents: "none" }}
      />
    </div>
  );
}
