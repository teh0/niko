import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, AlertCircle } from "lucide-react";
import type { Ticket, TicketStatus } from "@prisma/client";

const COLUMNS: { status: TicketStatus; label: string; accent: string }[] = [
  { status: "TODO", label: "To do", accent: "text-muted-foreground" },
  { status: "IN_PROGRESS", label: "In progress", accent: "text-blue-600" },
  { status: "IN_REVIEW", label: "In review", accent: "text-amber-600" },
  { status: "DONE", label: "Done", accent: "text-emerald-600" },
];

const ROLE_COLOR: Record<string, string> = {
  DEV_WEB: "bg-sky-50 text-sky-700 border-sky-200",
  DEV_MOBILE: "bg-violet-50 text-violet-700 border-violet-200",
  DEV_BACKEND: "bg-orange-50 text-orange-700 border-orange-200",
  DB_EXPERT: "bg-rose-50 text-rose-700 border-rose-200",
  QA: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export function Kanban({ tickets }: { tickets: Ticket[] }) {
  const byStatus = new Map<TicketStatus, Ticket[]>();
  for (const t of tickets) {
    const bucket = byStatus.get(t.status) ?? [];
    bucket.push(t);
    byStatus.set(t.status, bucket);
  }
  const blocked = tickets.filter((t) => t.status === "BLOCKED");
  const changesRequested = tickets.filter((t) => t.status === "CHANGES_REQUESTED");

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {COLUMNS.map((col) => {
          const items = byStatus.get(col.status) ?? [];
          return (
            <div key={col.status} className="min-w-0">
              <div className="flex items-center justify-between mb-2 px-1">
                <div className={`text-xs font-semibold uppercase tracking-wider ${col.accent}`}>
                  {col.label}
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {items.length}
                </span>
              </div>
              <div className="space-y-2">
                {items.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground italic px-3 py-3 border border-dashed border-border rounded-md">
                    empty
                  </div>
                ) : (
                  items.map((t) => <TicketCard key={t.id} ticket={t} />)
                )}
              </div>
            </div>
          );
        })}
      </div>

      {(blocked.length > 0 || changesRequested.length > 0) && (
        <div className="mt-5 space-y-3">
          {blocked.length > 0 && (
            <AttentionRow
              title="Blocked"
              subtitle="Agent is stuck — waiting for human."
              items={blocked}
              tone="red"
            />
          )}
          {changesRequested.length > 0 && (
            <AttentionRow
              title="Changes requested"
              subtitle="QA asked for revisions."
              items={changesRequested}
              tone="amber"
            />
          )}
        </div>
      )}
    </div>
  );
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  const roleClass = ROLE_COLOR[ticket.role] ?? "bg-muted text-muted-foreground border-border";
  return (
    <Card className="p-3 text-sm hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm leading-snug min-w-0">{ticket.title}</div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Badge
          variant="outline"
          className={`font-mono text-[9px] h-5 ${roleClass}`}
        >
          {ticket.role.replace("_", " ")}
        </Badge>
        {ticket.prNumber && (
          <span className="text-[10px] text-primary inline-flex items-center gap-0.5 font-mono">
            #{ticket.prNumber}
            <ExternalLink className="size-2.5" />
          </span>
        )}
      </div>
    </Card>
  );
}

function AttentionRow({
  title,
  subtitle,
  items,
  tone,
}: {
  title: string;
  subtitle: string;
  items: Ticket[];
  tone: "red" | "amber";
}) {
  const color =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-amber-200 bg-amber-50 text-amber-700";
  return (
    <Card className={`p-3 ${color}`}>
      <div className="flex items-start gap-2">
        <AlertCircle className="size-4 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold">{title}</div>
          <div className="text-[11px] opacity-80">{subtitle}</div>
          <ul className="mt-1.5 space-y-0.5">
            {items.map((t) => (
              <li key={t.id} className="text-xs truncate">
                <span className="font-mono text-[10px] text-muted-foreground">
                  {t.role}
                </span>{" "}
                {t.title}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
