import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Shield,
  Kanban,
  FileText,
  Activity,
  CheckCircle2,
  CircleDashed,
  XCircle,
  ArrowRight,
  Loader2,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProjectOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      gates: { orderBy: { createdAt: "desc" }, take: 4 },
      tickets: true,
      agentRuns: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!project) notFound();

  const pendingGates = project.gates.filter((g) => g.status === "PENDING");
  const ticketsByStatus = {
    todo: project.tickets.filter((t) => t.status === "TODO").length,
    inProgress: project.tickets.filter((t) => t.status === "IN_PROGRESS").length,
    inReview: project.tickets.filter((t) => t.status === "IN_REVIEW").length,
    done: project.tickets.filter((t) => t.status === "DONE").length,
    blocked: project.tickets.filter((t) => t.status === "BLOCKED").length,
  };

  // "Blocked" = latest run is FAILED, no PENDING gate, nothing running/queued.
  // In that state the flow can't advance on its own — surface it to the user.
  const latestRun = project.agentRuns[0];
  const anyActive = project.agentRuns.some(
    (r) => r.status === "RUNNING" || r.status === "QUEUED",
  );
  const flowBlocked =
    latestRun?.status === "FAILED" && pendingGates.length === 0 && !anyActive;

  return (
    <div className="px-8 py-8 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of the studio&rsquo;s work on this project.
        </p>
      </header>

      {flowBlocked && latestRun && (
        <Card className="p-4 border-red-200 bg-red-50">
          <div className="flex items-start gap-3">
            <XCircle className="size-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-red-800">
                Flow is blocked
              </div>
              <p className="mt-0.5 text-xs text-red-700">
                The {latestRun.role} agent failed and no other work is queued.
                Retry from the runs page, or talk to the PM if you want to
                rescope.
              </p>
              <div className="mt-2">
                <Link
                  href={`/projects/${id}/runs`}
                  className="text-xs font-medium text-red-700 hover:text-red-900 underline underline-offset-2"
                >
                  Go to runs →
                </Link>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          title="Pending gates"
          value={pendingGates.length}
          hint={pendingGates.length > 0 ? "Needs your review" : "You're all caught up"}
          href={`/projects/${id}/gates`}
          icon={Shield}
          urgent={pendingGates.length > 0}
        />
        <StatCard
          title="Tickets in flight"
          value={ticketsByStatus.inProgress + ticketsByStatus.inReview}
          hint={`${ticketsByStatus.todo} todo · ${ticketsByStatus.done} done`}
          href={`/projects/${id}/backlog`}
          icon={Kanban}
        />
      </div>

      {/* Pending gates snippet */}
      {pendingGates.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold">Awaiting your review</h2>
            <Link
              href={`/projects/${id}/gates`}
              className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
            >
              See all <ArrowRight className="size-3" />
            </Link>
          </div>
          <ul className="space-y-2">
            {pendingGates.slice(0, 3).map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between gap-4 py-2 border-t border-border first:border-t-0 first:pt-0"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px]">
                    {g.kind}
                  </Badge>
                  <span className="text-sm truncate">{g.title}</span>
                </div>
                <CircleDashed className="size-4 text-amber-600" />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Live running agents — highlighted */}
      {project.agentRuns.filter((r) => r.status === "RUNNING").length > 0 && (
        <Card className="p-5 border-blue-200 bg-blue-50/40">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Loader2 className="size-4 text-blue-600 animate-spin" />
              Working right now
            </h2>
          </div>
          <ul className="space-y-1.5">
            {project.agentRuns
              .filter((r) => r.status === "RUNNING")
              .map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-sm">
                  <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                    {r.role}
                  </Badge>
                  <span className="truncate">{r.task}</span>
                </li>
              ))}
          </ul>
        </Card>
      )}

      {/* Recent runs */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Recent agent activity</h2>
          <Link
            href={`/projects/${id}/runs`}
            className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
          >
            See all <ArrowRight className="size-3" />
          </Link>
        </div>
        {project.agentRuns.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <ul className="space-y-2">
            {project.agentRuns.map((r) => {
              const Icon =
                r.status === "SUCCEEDED"
                  ? CheckCircle2
                  : r.status === "FAILED"
                    ? XCircle
                    : r.status === "RUNNING"
                      ? Loader2
                      : CircleDashed;
              const color =
                r.status === "SUCCEEDED"
                  ? "text-emerald-600"
                  : r.status === "FAILED"
                    ? "text-red-600"
                    : r.status === "RUNNING"
                      ? "text-blue-600"
                      : "text-muted-foreground";
              return (
                <li
                  key={r.id}
                  className="flex items-center justify-between gap-3 py-1.5"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Icon
                      className={cn(
                        "size-4 shrink-0",
                        color,
                        r.status === "RUNNING" && "animate-spin",
                      )}
                    />
                    <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                      {r.role}
                    </Badge>
                    <span className="text-sm truncate">{r.task}</span>
                  </div>
                  <span
                    className={cn(
                      "font-mono text-[10px] uppercase tracking-wider shrink-0",
                      color,
                    )}
                  >
                    {r.status.toLowerCase()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <QuickLink
          href={`/projects/${id}/brief`}
          icon={FileText}
          title="Brief"
          subtitle="The project's specs & intake"
        />
        <QuickLink
          href={`/projects/${id}/runs`}
          icon={Activity}
          title="Agent runs"
          subtitle="Full activity log"
        />
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  hint,
  href,
  icon: Icon,
  urgent,
}: {
  title: string;
  value: number;
  hint: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  urgent?: boolean;
}) {
  return (
    <Link href={href} className="group">
      <Card
        className={cn(
          "p-5 transition-all hover:shadow-sm",
          urgent && "border-amber-200 bg-amber-50/40",
        )}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </div>
            <div className="mt-2 text-3xl font-semibold tabular-nums">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
          </div>
          <Icon
            className={cn(
              "size-5",
              urgent ? "text-amber-600" : "text-muted-foreground",
            )}
          />
        </div>
      </Card>
    </Link>
  );
}

function QuickLink({
  href,
  icon: Icon,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
}) {
  return (
    <Link href={href} className="group">
      <Card className="p-4 transition-all hover:shadow-sm hover:border-foreground/20">
        <div className="flex items-center gap-3">
          <Icon className="size-5 text-muted-foreground group-hover:text-foreground transition-colors" />
          <div>
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
