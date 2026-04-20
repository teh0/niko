import { notFound } from "next/navigation";
import { ExternalLink, CircleDashed, CheckCircle2, XCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { GateActions } from "./gate-actions";
import { GateChat } from "./gate-chat";
import { GATE_RESPONDER, supportsGateChat } from "@/lib/gate-chat/prompt";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  PM: "PM",
  TECH_LEAD: "Tech Lead",
  DB_EXPERT: "DB Expert",
  DEV_WEB: "Dev Web",
  DEV_MOBILE: "Dev Mobile",
  DEV_BACKEND: "Dev Backend",
  QA: "QA",
  RED_TEAM_QA: "Red Team",
  DEBUG: "Debug",
};

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      gates: { orderBy: { createdAt: "desc" } },
      tickets: { orderBy: { priority: "asc" } },
      agentRuns: { orderBy: { createdAt: "desc" }, take: 20 },
      pullRequests: { orderBy: { number: "desc" } },
    },
  });
  if (!project) notFound();

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto space-y-8">
      <header>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
            <a
              href={`https://github.com/${project.githubOwner}/${project.githubRepo}`}
              target="_blank"
              rel="noreferrer"
              className="mt-1 text-sm text-muted-foreground font-mono inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              {project.githubOwner}/{project.githubRepo}
              <ExternalLink className="size-3" />
            </a>
          </div>
          <Badge variant="secondary" className="font-mono text-[10px]">
            {project.status}
          </Badge>
        </div>
      </header>

      <Section title="Brief">
        <Card className="p-5">
          <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans leading-relaxed">
            {project.brief}
          </pre>
        </Card>
      </Section>

      <Section
        title="Validation gates"
        hint="Review, discuss, and approve each step to advance the project."
      >
        {project.gates.length === 0 ? (
          <EmptyState>No gates yet.</EmptyState>
        ) : (
          <div className="space-y-2">
            {project.gates.map((g) => {
              const responder = GATE_RESPONDER[g.kind];
              const agentLabel = responder ? ROLE_LABEL[responder] : "agent";
              return (
                <Card key={g.id} className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <Badge variant="outline" className="font-mono text-[10px] h-5">
                          {g.kind}
                        </Badge>
                        <span className="font-medium">{g.title}</span>
                      </div>
                      {g.prUrl && (
                        <a
                          href={g.prUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 text-xs text-primary hover:underline inline-flex items-center gap-1"
                        >
                          PR #{g.prNumber}
                          <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {g.status === "PENDING" && <GateActions gateId={g.id} />}
                      <GateBadge status={g.status} decision={g.decision} />
                    </div>
                  </div>
                  {g.status === "PENDING" && (
                    <GateChat
                      gateId={g.id}
                      agentLabel={agentLabel}
                      supportsChat={supportsGateChat(g.kind)}
                    />
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="Tickets">
        {project.tickets.length === 0 ? (
          <EmptyState>Not broken down yet.</EmptyState>
        ) : (
          <Card className="divide-y divide-border">
            {project.tickets.map((t) => (
              <div key={t.id} className="px-4 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t.title}</div>
                  <div className="text-xs text-muted-foreground font-mono mt-0.5">
                    {t.role}
                  </div>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">
                  {t.status}
                </Badge>
              </div>
            ))}
          </Card>
        )}
      </Section>

      <Section title="Recent agent runs">
        {project.agentRuns.length === 0 ? (
          <EmptyState>No runs yet.</EmptyState>
        ) : (
          <Card className="divide-y divide-border text-sm">
            {project.agentRuns.map((r) => (
              <div
                key={r.id}
                className="px-4 py-2.5 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                    {r.role}
                  </Badge>
                  <span className="truncate">{r.task}</span>
                </div>
                <RunStatusBadge status={r.status} />
              </div>
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
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <Card className="p-6 border-dashed text-center">
      <p className="text-sm text-muted-foreground">{children}</p>
    </Card>
  );
}

function GateBadge({
  status,
  decision,
}: {
  status: string;
  decision: string | null;
}) {
  const isPending = status === "PENDING";
  const isApproved = decision === "APPROVED";
  const isNegative = decision === "REJECTED" || decision === "CHANGES_REQUESTED";

  const Icon = isPending ? CircleDashed : isApproved ? CheckCircle2 : XCircle;
  const label = isPending
    ? "pending"
    : (decision ?? "decided").toLowerCase().replace("_", " ");

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 text-[10px] font-normal",
        isPending && "text-amber-600 border-amber-200 bg-amber-50",
        isApproved && "text-emerald-600 border-emerald-200 bg-emerald-50",
        isNegative && "text-red-600 border-red-200 bg-red-50",
      )}
    >
      <Icon className="size-3" />
      {label}
    </Badge>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono text-[10px]",
        status === "SUCCEEDED" && "text-emerald-600 border-emerald-200 bg-emerald-50",
        status === "FAILED" && "text-red-600 border-red-200 bg-red-50",
        status === "RUNNING" && "text-blue-600 border-blue-200 bg-blue-50",
        status === "QUEUED" && "text-muted-foreground",
      )}
    >
      {status}
    </Badge>
  );
}
