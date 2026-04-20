import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  Users,
  Wrench,
  ShieldCheck,
  Brain,
  LineChart,
  ArrowRight,
} from "lucide-react";
import type { AgentRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "../runs/auto-refresh";

export const dynamic = "force-dynamic";

type Pole = {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AgentRole[];
};

// Worker roles only — INTAKE runs inline in the web app, not via the queue.
const POLES: Pole[] = [
  {
    key: "product",
    label: "Product",
    description: "Scope, specs, and prioritization",
    icon: Brain,
    roles: ["PM"],
  },
  {
    key: "leadership",
    label: "Leadership",
    description: "Architecture and coordination",
    icon: LineChart,
    roles: ["TECH_LEAD"],
  },
  {
    key: "engineering",
    label: "Engineering",
    description: "The people writing code",
    icon: Wrench,
    roles: ["DEV_WEB", "DEV_MOBILE", "DEV_BACKEND", "DB_EXPERT"],
  },
  {
    key: "quality",
    label: "Quality & safety",
    description: "Everyone keeping what ships from breaking",
    icon: ShieldCheck,
    roles: ["QA", "RED_TEAM_QA", "DEBUG"],
  },
];

const ROLE_META: Record<AgentRole, { label: string; description: string; emoji: string }> = {
  PM: {
    label: "Product Manager",
    description: "Turns ideas into specs, maintains the backlog",
    emoji: "📋",
  },
  TECH_LEAD: {
    label: "Tech Lead",
    description: "Picks stack, scaffolds, breaks down tickets",
    emoji: "🏗️",
  },
  DEV_WEB: {
    label: "Web Engineer",
    description: "Implements the Next.js frontend",
    emoji: "🌐",
  },
  DEV_MOBILE: {
    label: "Mobile Engineer",
    description: "Implements the Flutter app",
    emoji: "📱",
  },
  DEV_BACKEND: {
    label: "Backend Engineer",
    description: "NestJS / API / integrations",
    emoji: "⚙️",
  },
  DB_EXPERT: {
    label: "DB Expert",
    description: "Schema, migrations, query perf",
    emoji: "🗄️",
  },
  QA: {
    label: "QA Engineer",
    description: "Reviews PRs against acceptance criteria",
    emoji: "🔍",
  },
  RED_TEAM_QA: {
    label: "Red Team",
    description: "Adversarial QA: tries to break everything",
    emoji: "🥷",
  },
  DEBUG: {
    label: "Debug Agent",
    description: "Investigates root causes when another agent is stuck",
    emoji: "🔎",
  },
  INTAKE: {
    label: "Client Success",
    description: "Chats with you to scope new projects (inline)",
    emoji: "💬",
  },
};

export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      agentRuns: { orderBy: { createdAt: "desc" }, take: 100 },
      tickets: true,
    },
  });
  if (!project) notFound();

  // Build a per-role snapshot: current activity + recent stats.
  const snapshot = new Map<
    AgentRole,
    {
      active?: (typeof project.agentRuns)[number];
      lastFinished?: (typeof project.agentRuns)[number];
      totalRuns: number;
      successRate: number | null;
    }
  >();

  for (const role of Object.keys(ROLE_META) as AgentRole[]) {
    const runs = project.agentRuns.filter((r) => r.role === role);
    const active = runs.find((r) => r.status === "RUNNING" || r.status === "QUEUED");
    const lastFinished = runs.find(
      (r) => r.status === "SUCCEEDED" || r.status === "FAILED",
    );
    const finished = runs.filter((r) => r.status === "SUCCEEDED" || r.status === "FAILED");
    const succeeded = finished.filter((r) => r.status === "SUCCEEDED").length;
    snapshot.set(role, {
      active,
      lastFinished,
      totalRuns: runs.length,
      successRate: finished.length > 0 ? succeeded / finished.length : null,
    });
  }

  const anyActive = Array.from(snapshot.values()).some((s) => s.active);
  const activeCount = Array.from(snapshot.values()).filter((s) => s.active).length;

  return (
    <div className="px-8 py-8 max-w-6xl">
      {anyActive && <AutoRefresh intervalMs={3000} />}

      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Users className="size-6 text-muted-foreground" />
            Studio
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live view of who&rsquo;s working on this project.
            {anyActive &&
              " Auto-refreshes every 3s."}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-3xl font-semibold tabular-nums">{activeCount}</div>
          <div className="text-xs text-muted-foreground">
            agent{activeCount > 1 ? "s" : ""} working
          </div>
        </div>
      </header>

      <div className="space-y-8">
        {POLES.map((pole) => (
          <section key={pole.key}>
            <div className="mb-3 flex items-center gap-2">
              <pole.icon className="size-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold tracking-tight">{pole.label}</h2>
              <span className="text-xs text-muted-foreground">· {pole.description}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pole.roles.map((role) => {
                const snap = snapshot.get(role)!;
                const ticket = snap.active?.ticketId
                  ? project.tickets.find((t) => t.id === snap.active?.ticketId)
                  : undefined;
                return (
                  <AgentCard
                    key={role}
                    role={role}
                    projectId={id}
                    active={snap.active}
                    lastFinished={snap.lastFinished}
                    totalRuns={snap.totalRuns}
                    successRate={snap.successRate}
                    ticketTitle={ticket?.title}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function AgentCard({
  role,
  projectId,
  active,
  lastFinished,
  totalRuns,
  successRate,
  ticketTitle,
}: {
  role: AgentRole;
  projectId: string;
  active?: { id: string; task: string; status: string; startedAt: Date | null; createdAt: Date };
  lastFinished?: { id: string; task: string; status: string; endedAt: Date | null };
  totalRuns: number;
  successRate: number | null;
  ticketTitle?: string;
}) {
  const meta = ROLE_META[role];
  const isWorking = active?.status === "RUNNING";
  const isQueued = active?.status === "QUEUED";

  const stateColor = isWorking
    ? "border-blue-200 bg-blue-50/40 hover:bg-blue-50/60"
    : isQueued
      ? "border-amber-200 bg-amber-50/40 hover:bg-amber-50/60"
      : "hover:bg-muted/40";

  // Whichever run to link to: prefer the active one (live logs) else last finished.
  const linkRun = active?.id ?? lastFinished?.id;
  const CardTag: React.ElementType = linkRun ? Link : "div";
  const cardProps: Record<string, unknown> = linkRun
    ? { href: `/projects/${projectId}/runs/${linkRun}` }
    : {};

  return (
    <CardTag {...cardProps} className="block">
    <Card className={cn("p-4 transition-all", stateColor, linkRun && "cursor-pointer")}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 size-9 rounded-lg bg-background border border-border flex items-center justify-center text-lg">
          {meta.emoji}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold truncate">{meta.label}</div>
            <StatusDot status={active?.status ?? "IDLE"} />
          </div>
          <div className="text-[11px] text-muted-foreground leading-snug mt-0.5">
            {meta.description}
          </div>
        </div>
      </div>

      {isWorking && active && (
        <div className="mt-3 pt-3 border-t border-blue-200/60">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-blue-700">
            <Loader2 className="size-3 animate-spin" />
            Working
          </div>
          <div className="mt-1 text-xs truncate">{active.task}</div>
          {ticketTitle && (
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              on: {ticketTitle}
            </div>
          )}
          {active.startedAt && (
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              started {relativeTime(active.startedAt)}
            </div>
          )}
        </div>
      )}

      {isQueued && active && (
        <div className="mt-3 pt-3 border-t border-amber-200/60">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-700">
            Queued
          </div>
          <div className="mt-1 text-xs truncate">{active.task}</div>
        </div>
      )}

      {!active && lastFinished && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[11px] text-muted-foreground">
            Last: {lastFinished.status.toLowerCase()} ·{" "}
            {lastFinished.endedAt ? relativeTime(lastFinished.endedAt) : ""}
          </div>
          <div className="mt-0.5 text-xs truncate text-muted-foreground">
            {lastFinished.task}
          </div>
        </div>
      )}

      {!active && !lastFinished && totalRuns === 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="text-[11px] text-muted-foreground italic">
            Not invoked yet on this project
          </div>
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
        <div className="tabular-nums">
          {totalRuns} run{totalRuns > 1 ? "s" : ""}
          {successRate != null && <> · {Math.round(successRate * 100)}% ok</>}
        </div>
        {linkRun && (
          <span className="text-primary inline-flex items-center gap-0.5">
            {isWorking ? "live logs" : "logs"} <ArrowRight className="size-2.5" />
          </span>
        )}
      </div>
    </Card>
    </CardTag>
  );
}

function StatusDot({ status }: { status: string }) {
  const cls =
    status === "RUNNING"
      ? "bg-blue-500 animate-pulse"
      : status === "QUEUED"
        ? "bg-amber-500"
        : "bg-muted-foreground/30";
  const label =
    status === "RUNNING"
      ? "working"
      : status === "QUEUED"
        ? "queued"
        : "idle";
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <span className={cn("size-2 rounded-full", cls)} />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function relativeTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
