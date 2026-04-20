import { notFound } from "next/navigation";
import {
  Cpu,
  Database,
  FolderTree,
  ExternalLink,
  CheckCircle2,
  CircleDashed,
  XCircle,
  FileText,
} from "lucide-react";
import type { Gate, GateKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ProjectDecisionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      gates: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!project) notFound();

  // Group gates by kind — we render the LATEST one by default but keep
  // older iterations accessible.
  const stackGates = project.gates.filter((g) => g.kind === "STACK_PLAN");
  const dataGates = project.gates.filter((g) => g.kind === "DATA_MODEL");
  const scaffoldGates = project.gates.filter((g) => g.kind === "SCAFFOLD");

  const anyDecision =
    stackGates.length + dataGates.length + scaffoldGates.length > 0;

  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Décisions techniques</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Les choix structurants validés pendant la vie du projet — stack, modèle de
          données, organisation du repo.
        </p>
      </header>

      {!anyDecision && (
        <Card className="p-12 text-center border-dashed">
          <FileText className="mx-auto size-6 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">
            Aucune décision technique pour l&rsquo;instant. Elles apparaîtront
            ici dès que le Tech Lead et le DB Expert auront posé leurs premiers
            ADRs.
          </p>
        </Card>
      )}

      {stackGates.length > 0 && (
        <DecisionSection
          title="Stack technique"
          icon={Cpu}
          gates={stackGates}
          render={renderStackPlan}
        />
      )}

      {dataGates.length > 0 && (
        <DecisionSection
          title="Modèle de données"
          icon={Database}
          gates={dataGates}
          render={renderDataModel}
        />
      )}

      {scaffoldGates.length > 0 && (
        <DecisionSection
          title="Organisation du repo"
          icon={FolderTree}
          gates={scaffoldGates}
          render={renderScaffold}
        />
      )}
    </div>
  );
}

function DecisionSection({
  title,
  icon: Icon,
  gates,
  render,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  gates: Gate[];
  render: (data: Record<string, unknown>) => React.ReactNode;
}) {
  const latest = gates[0];
  const older = gates.slice(1);

  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {gates.length > 1 && (
          <span className="text-xs text-muted-foreground">
            · {gates.length} itérations
          </span>
        )}
      </div>
      <DecisionCard gate={latest} render={render} />
      {older.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground inline-flex items-center gap-1 pl-1">
            Voir les {older.length} itération{older.length > 1 ? "s" : ""} précédente{older.length > 1 ? "s" : ""}
          </summary>
          <div className="mt-2 space-y-2">
            {older.map((g) => (
              <DecisionCard key={g.id} gate={g} render={render} muted />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function DecisionCard({
  gate,
  render,
  muted,
}: {
  gate: Gate;
  render: (data: Record<string, unknown>) => React.ReactNode;
  muted?: boolean;
}) {
  const data = safeJson(gate.description);
  return (
    <Card className={cn("p-5", muted && "bg-muted/30")}>
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{gate.title}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {relativeTime(gate.createdAt)}
            {gate.decidedAt && (
              <> · décidé {relativeTime(gate.decidedAt)}</>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {gate.prUrl && (
            <a
              href={gate.prUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"
            >
              PR #{gate.prNumber}
              <ExternalLink className="size-3" />
            </a>
          )}
          <StatusBadge status={gate.status} decision={gate.decision} />
        </div>
      </div>
      {data ? (
        render(data)
      ) : (
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
          {gate.description.slice(0, 600)}
        </pre>
      )}
    </Card>
  );
}

// ─── Kind-specific renderers ────────────────────────────────────────────

function renderStackPlan(data: Record<string, unknown>) {
  const decision = (data.decision ?? data) as Record<string, unknown>;
  const rationale = (data.rationale as string) ?? "";
  const tradeoffs = Array.isArray(data.tradeoffs) ? (data.tradeoffs as string[]) : [];
  const adr = (data.adrDocPath as string) ?? "";

  const rows: Array<{ label: string; value: React.ReactNode }> = [];
  const web = decision.web as { framework?: string; notes?: string } | undefined;
  const mobile = decision.mobile as { framework?: string; notes?: string } | undefined;
  const backend = decision.backend as
    | { framework?: string; style?: string; services?: string[]; notes?: string }
    | undefined;
  const db = decision.database as
    | { engine?: string; orm?: string; notes?: string }
    | undefined;
  const monorepo = decision.monorepo as
    | { tool?: string; layout?: string[] }
    | undefined;
  const hosting = decision.hosting as
    | { web?: string; mobile?: string; backend?: string }
    | undefined;

  if (web?.framework)
    rows.push({
      label: "Web",
      value: (
        <>
          {web.framework}
          {web.notes && (
            <span className="text-muted-foreground"> · {web.notes}</span>
          )}
        </>
      ),
    });
  if (mobile?.framework)
    rows.push({
      label: "Mobile",
      value: (
        <>
          {mobile.framework}
          {mobile.notes && (
            <span className="text-muted-foreground"> · {mobile.notes}</span>
          )}
        </>
      ),
    });
  if (backend?.framework)
    rows.push({
      label: "Backend",
      value: (
        <>
          {backend.framework}
          {backend.style && (
            <span className="text-muted-foreground"> ({backend.style})</span>
          )}
          {backend.services?.length ? (
            <div className="mt-1 text-xs text-muted-foreground">
              Services : {backend.services.join(", ")}
            </div>
          ) : null}
        </>
      ),
    });
  if (db?.engine)
    rows.push({
      label: "Base de données",
      value: (
        <>
          {db.engine}
          {db.orm && db.orm !== "none" && (
            <span className="text-muted-foreground"> + {db.orm}</span>
          )}
        </>
      ),
    });
  if (monorepo?.tool && monorepo.tool !== "none")
    rows.push({ label: "Monorepo", value: monorepo.tool });
  if (hosting)
    rows.push({
      label: "Hosting",
      value: Object.entries(hosting)
        .filter(([, v]) => Boolean(v))
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · "),
    });

  return (
    <>
      {rows.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {rows.map((r) => (
            <>
              <dt
                key={`${r.label}-l`}
                className="text-xs uppercase tracking-wider text-muted-foreground font-semibold pt-0.5"
              >
                {r.label}
              </dt>
              <dd key={`${r.label}-v`}>{r.value}</dd>
            </>
          ))}
        </dl>
      )}
      {rationale && (
        <Block title="Rationale" body={rationale} />
      )}
      {tradeoffs.length > 0 && (
        <Block title="Tradeoffs" list={tradeoffs} />
      )}
      {adr && <DocLink path={adr} />}
    </>
  );
}

function renderDataModel(data: Record<string, unknown>) {
  const engine = (data.engine as string) ?? "";
  const orm = (data.orm as string) ?? "";
  const tables = Array.isArray(data.tables)
    ? (data.tables as Array<{
        name: string;
        purpose?: string;
        columns?: Array<{ name: string; type: string }>;
      }>)
    : [];
  const migrations = Array.isArray(data.migrations)
    ? (data.migrations as string[])
    : [];
  const adr = (data.adrDocPath as string) ?? "";

  return (
    <>
      <div className="flex gap-3 text-sm mb-4">
        {engine && (
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mr-1">
              Engine
            </span>
            {engine}
          </div>
        )}
        {orm && orm !== "none" && (
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mr-1">
              ORM
            </span>
            {orm}
          </div>
        )}
        {tables.length > 0 && (
          <div>
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mr-1">
              Tables
            </span>
            {tables.length}
          </div>
        )}
      </div>
      {tables.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
          {tables.map((t) => (
            <div key={t.name} className="border border-border rounded-md p-3 bg-muted/20">
              <div className="text-sm font-mono font-semibold">{t.name}</div>
              {t.purpose && (
                <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                  {t.purpose}
                </div>
              )}
              {t.columns && (
                <div className="mt-2 text-[10px] font-mono text-muted-foreground">
                  {t.columns.length} cols
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {migrations.length > 0 && (
        <Block title="Migrations" list={migrations} />
      )}
      {adr && <DocLink path={adr} />}
    </>
  );
}

function renderScaffold(data: Record<string, unknown>) {
  const rootFiles = Array.isArray(data.rootFiles) ? (data.rootFiles as string[]) : [];
  const packages = Array.isArray(data.packages) ? (data.packages as string[]) : [];
  const bootstrap = Array.isArray(data.bootstrap)
    ? (data.bootstrap as Array<{ command: string; description: string }>)
    : [];

  return (
    <>
      {packages.length > 0 && (
        <Block
          title="Packages"
          list={packages.map((p) => `\`${p}\``)}
        />
      )}
      {rootFiles.length > 0 && (
        <Block
          title="Fichiers racine"
          list={rootFiles.map((p) => `\`${p}\``)}
        />
      )}
      {bootstrap.length > 0 && (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Commandes de démarrage
          </div>
          <div className="space-y-2">
            {bootstrap.map((b) => (
              <div
                key={b.command}
                className="border border-border rounded-md p-2 bg-muted/20"
              >
                <code className="text-xs font-mono">{b.command}</code>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {b.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Small bits ─────────────────────────────────────────────────────────

function Block({
  title,
  body,
  list,
}: {
  title: string;
  body?: string;
  list?: string[];
}) {
  return (
    <div className="mt-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
        {title}
      </div>
      {body && (
        <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap break-words">
          {body}
        </p>
      )}
      {list && (
        <ul className="list-disc pl-5 space-y-1 text-sm text-foreground/90">
          {list.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DocLink({ path }: { path: string }) {
  return (
    <div className="mt-4 pt-3 border-t border-border">
      <span className="text-xs text-muted-foreground">
        Document :{" "}
        <code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{path}</code>
      </span>
    </div>
  );
}

function StatusBadge({
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
    ? "à valider"
    : isApproved
      ? "validé"
      : (decision ?? "").toLowerCase().replace("_", " ");
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 text-[10px]",
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

function safeJson(str: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(str);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

import { fmtRelative as relativeTime } from "@/lib/format";
