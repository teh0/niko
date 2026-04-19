import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

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
            className="text-sm text-accent font-mono"
          >
            {project.githubOwner}/{project.githubRepo} ↗
          </a>
        </div>
        <span className="px-3 py-1 rounded bg-panel border border-border text-sm">
          {project.status}
        </span>
      </header>

      <Section title="Brief">
        <pre className="whitespace-pre-wrap text-sm text-muted">{project.brief}</pre>
      </Section>

      <Section title="Validation gates" hint="Review and approve on GitHub to advance.">
        {project.gates.length === 0 ? (
          <p className="text-muted text-sm">No gates yet.</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md">
            {project.gates.map((g) => (
              <li key={g.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm">
                    <span className="font-mono text-xs text-muted mr-2">{g.kind}</span>
                    {g.title}
                  </div>
                  {g.prUrl && (
                    <a href={g.prUrl} target="_blank" className="text-xs text-accent">
                      PR #{g.prNumber} ↗
                    </a>
                  )}
                </div>
                <GateBadge status={g.status} decision={g.decision} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Tickets">
        {project.tickets.length === 0 ? (
          <p className="text-muted text-sm">Not broken down yet.</p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-md">
            {project.tickets.map((t) => (
              <li key={t.id} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">{t.title}</div>
                    <div className="text-xs text-muted font-mono">{t.role}</div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-panel border border-border">
                    {t.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recent agent runs">
        <ul className="divide-y divide-border border border-border rounded-md text-sm">
          {project.agentRuns.map((r) => (
            <li key={r.id} className="px-4 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted">{r.role}</span>
                <span>{r.task}</span>
              </div>
              <span className="text-xs text-muted">{r.status}</span>
            </li>
          ))}
        </ul>
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
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
        {hint && <span className="text-xs text-muted">{hint}</span>}
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
  const color =
    status === "PENDING"
      ? "bg-warn/20 text-warn border-warn/30"
      : decision === "APPROVED"
        ? "bg-ok/20 text-ok border-ok/30"
        : "bg-danger/20 text-danger border-danger/30";
  return (
    <span className={`text-xs px-2 py-0.5 rounded border ${color}`}>{label}</span>
  );
}
