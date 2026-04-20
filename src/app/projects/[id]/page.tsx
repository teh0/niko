import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { prisma } from "@/lib/db";
import { GateActions } from "./gate-actions";
import { GateChat } from "./gate-chat";
import { GATE_RESPONDER, supportsGateChat } from "@/lib/gate-chat/prompt";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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

export const dynamic = "force-dynamic";

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
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <a
            href={`https://github.com/${project.githubOwner}/${project.githubRepo}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-primary font-mono flex items-center gap-1 hover:underline"
          >
            {project.githubOwner}/{project.githubRepo}
            <ExternalLink className="size-3" />
          </a>
        </div>
        <Badge variant="outline">{project.status}</Badge>
      </header>

      <Section title="Brief">
        <Card className="p-4">
          <pre className="whitespace-pre-wrap text-sm text-muted-foreground font-sans">
            {project.brief}
          </pre>
        </Card>
      </Section>

      <Section
        title="Validation gates"
        hint="Review and approve on GitHub, or use the buttons here (local / no-webhook mode)."
      >
        {project.gates.length === 0 ? (
          <p className="text-muted-foreground text-sm">No gates yet.</p>
        ) : (
          <Card className="divide-y divide-border">
            {project.gates.map((g) => {
              const responder = GATE_RESPONDER[g.kind];
              const agentLabel = responder ? ROLE_LABEL[responder] : "agent";
              return (
                <div key={g.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm">
                        <span className="font-mono text-xs text-muted-foreground mr-2">
                          {g.kind}
                        </span>
                        {g.title}
                      </div>
                      {g.prUrl && (
                        <a
                          href={g.prUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary flex items-center gap-1 hover:underline mt-0.5"
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
                </div>
              );
            })}
          </Card>
        )}
      </Section>

      <Section title="Tickets">
        {project.tickets.length === 0 ? (
          <p className="text-muted-foreground text-sm">Not broken down yet.</p>
        ) : (
          <Card className="divide-y divide-border">
            {project.tickets.map((t) => (
              <div key={t.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">{t.title}</div>
                    <div className="text-xs text-muted-foreground font-mono">
                      {t.role}
                    </div>
                  </div>
                  <Badge variant="outline">{t.status}</Badge>
                </div>
              </div>
            ))}
          </Card>
        )}
      </Section>

      <Section title="Recent agent runs">
        <Card className="divide-y divide-border text-sm">
          {project.agentRuns.length === 0 ? (
            <div className="px-4 py-3 text-muted-foreground">No runs yet.</div>
          ) : (
            project.agentRuns.map((r) => (
              <div key={r.id} className="px-4 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {r.role}
                  </span>
                  <span>{r.task}</span>
                </div>
                <span className="text-xs text-muted-foreground">{r.status}</span>
              </div>
            ))
          )}
        </Card>
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
      <div className="mb-2 flex items-baseline gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

function GateBadge({
  status,
  decision,
}: {
  status: string;
  decision: string | null;
}) {
  const label = status === "PENDING" ? "waiting review" : (decision ?? "decided").toLowerCase();
  return (
    <Badge
      variant="outline"
      className={cn(
        status === "PENDING" && "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
        decision === "APPROVED" && "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
        (decision === "REJECTED" || decision === "CHANGES_REQUESTED") &&
          "bg-red-500/15 text-red-500 border-red-500/30",
      )}
    >
      {label}
    </Badge>
  );
}
