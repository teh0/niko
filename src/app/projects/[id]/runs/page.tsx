import { notFound } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, XCircle, Activity, CircleDashed, Loader2, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { RunErrorDetail } from "./run-error";
import { AutoRefresh } from "./auto-refresh";

export const dynamic = "force-dynamic";

export default async function ProjectRunsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { agentRuns: { orderBy: { createdAt: "desc" }, take: 50 } },
  });
  if (!project) notFound();

  const running = project.agentRuns.filter((r) => r.status === "RUNNING");
  const queued = project.agentRuns.filter((r) => r.status === "QUEUED");
  const recent = project.agentRuns.filter(
    (r) => r.status !== "RUNNING" && r.status !== "QUEUED",
  );

  const hasActive = running.length > 0 || queued.length > 0;

  return (
    <div className="px-8 py-8 max-w-4xl">
      {hasActive && <AutoRefresh intervalMs={3000} />}
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Agent runs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every time an agent picked up a task — live, queued, and history.
          {hasActive && " (auto-refreshes every 3s while work is in flight)"}
        </p>
      </header>

      {/* LIVE — running right now */}
      {running.length > 0 && (
        <Section title="Live" hint="Agents working right now">
          <Card className="divide-y divide-border border-blue-200 bg-blue-50/40">
            {running.map((r) => (
              <RunRow key={r.id} run={r} projectId={id} live />
            ))}
          </Card>
        </Section>
      )}

      {/* QUEUED — waiting for a worker */}
      {queued.length > 0 && (
        <Section title="Queued" hint="Waiting for a worker slot">
          <Card className="divide-y divide-border">
            {queued.map((r) => (
              <RunRow key={r.id} run={r} projectId={id} />
            ))}
          </Card>
        </Section>
      )}

      {/* HISTORY */}
      <Section title="History">
        {recent.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <Activity className="mx-auto size-6 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">No past runs.</p>
          </Card>
        ) : (
          <Card className="divide-y divide-border">
            {recent.map((r) => (
              <RunRow key={r.id} run={r} projectId={id} />
            ))}
          </Card>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <div className="mb-2 flex items-baseline gap-3">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function RunRow({
  run,
  projectId,
  live,
}: {
  run: {
    id: string;
    role: string;
    task: string;
    status: string;
    error: string | null;
    startedAt: Date | null;
    endedAt: Date | null;
    createdAt: Date;
    tokensIn: number | null;
    tokensOut: number | null;
  };
  projectId: string;
  live?: boolean;
}) {
  const { Icon, color, bg } = statusStyle(run.status);
  const duration = run.startedAt
    ? formatDuration(
        (run.endedAt ?? new Date()).getTime() - run.startedAt.getTime(),
      )
    : null;

  return (
    <div className="group px-4 py-3 flex items-start gap-3 hover:bg-muted/40 transition-colors">
      <div className={cn("mt-0.5 shrink-0 size-8 rounded-full flex items-center justify-center", bg)}>
        <Icon className={cn("size-4", color, live && "animate-spin")} />
      </div>
      <div className="min-w-0 flex-1">
        <Link
          href={`/projects/${projectId}/runs/${run.id}`}
          className="block"
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-[10px]">
              {run.role}
            </Badge>
            <span className="text-sm font-medium truncate group-hover:text-primary transition-colors">
              {run.task}
            </span>
            <ChevronRight className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
            <StatusPill status={run.status} />
            <span>· {relativeTime(run.createdAt)}</span>
            {duration && <span>· {duration}</span>}
            {run.tokensIn != null && run.tokensOut != null && (
              <span>
                · {run.tokensIn.toLocaleString()} / {run.tokensOut.toLocaleString()} tokens
              </span>
            )}
          </div>
        </Link>
        {run.error && (
          <RunErrorDetail
            error={run.error}
            runId={run.id}
            retryable={run.status === "FAILED"}
          />
        )}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const { color, bg } = statusStyle(status);
  return (
    <span
      className={cn(
        "uppercase tracking-wider font-mono text-[10px] px-1.5 py-0.5 rounded",
        color,
        bg,
      )}
    >
      {status}
    </span>
  );
}

function statusStyle(status: string) {
  switch (status) {
    case "SUCCEEDED":
      return {
        Icon: CheckCircle2,
        color: "text-emerald-600",
        bg: "bg-emerald-50",
      };
    case "FAILED":
      return { Icon: XCircle, color: "text-red-600", bg: "bg-red-50" };
    case "RUNNING":
      return { Icon: Loader2, color: "text-blue-600", bg: "bg-blue-50" };
    case "CANCELLED":
      return { Icon: XCircle, color: "text-muted-foreground", bg: "bg-muted" };
    default:
      return {
        Icon: CircleDashed,
        color: "text-muted-foreground",
        bg: "bg-muted",
      };
  }
}

function relativeTime(date: Date): string {
  const diff = Date.now() - new Date(date).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remS = s % 60;
  return `${m}m ${remS}s`;
}
