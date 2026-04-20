import { notFound } from "next/navigation";
import { Activity } from "lucide-react";
import type { AgentRun } from "@prisma/client";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "./auto-refresh";
import { RoleFilter, RunGroup } from "./client";
import { RunRow, formatDuration, type GroupedRuns } from "./shared";
import { fmtNumber } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function ProjectRunsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ role?: string }>;
}) {
  const { id } = await params;
  const { role: roleFilter } = await searchParams;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { agentRuns: { orderBy: { createdAt: "desc" }, take: 200 } },
  });
  if (!project) notFound();

  // Stats on the full set (not filtered).
  const all = project.agentRuns;
  const running = all.filter((r) => r.status === "RUNNING");
  const queued = all.filter((r) => r.status === "QUEUED");
  const succeeded = all.filter((r) => r.status === "SUCCEEDED").length;
  const failed = all.filter((r) => r.status === "FAILED").length;
  const totalTokens = all.reduce(
    (n, r) => n + (r.tokensIn ?? 0) + (r.tokensOut ?? 0),
    0,
  );
  const totalMs = all.reduce((n, r) => {
    if (!r.startedAt) return n;
    const end = r.endedAt ?? new Date();
    return n + (new Date(end).getTime() - new Date(r.startedAt).getTime());
  }, 0);
  const roles = Array.from(new Set(all.map((r) => r.role)));

  // Apply role filter.
  const filtered = roleFilter ? all.filter((r) => r.role === roleFilter) : all;
  const filteredRunning = filtered.filter((r) => r.status === "RUNNING");
  const filteredQueued = filtered.filter((r) => r.status === "QUEUED");
  const filteredHistory = filtered.filter(
    (r) => r.status !== "RUNNING" && r.status !== "QUEUED",
  );

  const groups = groupRuns(filteredHistory);
  const hasActive = running.length > 0 || queued.length > 0;

  return (
    <div className="px-8 py-8">
      {hasActive && <AutoRefresh intervalMs={3000} />}

      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Agent runs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every invocation of an agent on this project.
          {hasActive && " Live auto-refreshes every 3s."}
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-6">
        <StatTile label="Total" value={all.length} />
        <StatTile label="Live" value={running.length} tone="blue" />
        <StatTile label="Succeeded" value={succeeded} tone="emerald" />
        <StatTile label="Failed" value={failed} tone="red" />
        <StatTile
          label="Tokens"
          value={totalTokens}
          secondary={totalMs > 0 ? formatDuration(totalMs) : undefined}
        />
      </div>

      {roles.length > 1 && (
        <RoleFilter roles={roles} active={roleFilter} projectId={id} />
      )}

      {filteredRunning.length > 0 && (
        <section className="mb-6">
          <SectionHeader title="Live" hint="Working right now" />
          <Card className="divide-y divide-border border-blue-200 bg-blue-50/40">
            {filteredRunning.map((r) => (
              <RunRow key={r.id} run={r} projectId={id} live />
            ))}
          </Card>
        </section>
      )}

      {filteredQueued.length > 0 && (
        <section className="mb-6">
          <SectionHeader title="Queued" hint="Waiting for a worker slot" />
          <Card className="divide-y divide-border">
            {filteredQueued.map((r) => (
              <RunRow key={r.id} run={r} projectId={id} />
            ))}
          </Card>
        </section>
      )}

      <section>
        <SectionHeader
          title="History"
          hint={
            groups.length
              ? `${groups.length} group${groups.length > 1 ? "s" : ""}`
              : undefined
          }
        />
        {groups.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <Activity className="mx-auto size-6 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">
              {roleFilter ? `No past runs for ${roleFilter}.` : "No past runs yet."}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {groups.map((g) => (
              <RunGroup key={g.key} group={g} projectId={id} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/** Collapse consecutive runs with the same (role, task) into one group. */
function groupRuns(runs: AgentRun[]): GroupedRuns[] {
  const out: GroupedRuns[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && last.role === r.role && last.task === r.task) {
      last.runs.push(r);
      last.statusMix[r.status] = (last.statusMix[r.status] ?? 0) + 1;
    } else {
      out.push({
        key: r.id,
        role: r.role,
        task: r.task,
        runs: [r],
        statusMix: { [r.status]: 1 },
        latestCreatedAt: r.createdAt,
      });
    }
  }
  return out;
}

function StatTile({
  label,
  value,
  tone,
  secondary,
}: {
  label: string;
  value: number;
  tone?: "blue" | "emerald" | "red";
  secondary?: string;
}) {
  const toneCls =
    tone === "blue"
      ? "text-blue-600"
      : tone === "emerald"
        ? "text-emerald-600"
        : tone === "red"
          ? "text-red-600"
          : "";
  return (
    <Card className="p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn("text-2xl font-semibold tabular-nums mt-1", toneCls)}>
        {fmtNumber(value)}
      </div>
      {secondary && (
        <div className="text-[11px] text-muted-foreground mt-0.5">{secondary}</div>
      )}
    </Card>
  );
}

function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-3">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
