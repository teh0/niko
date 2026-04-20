import { notFound } from "next/navigation";
import { ExternalLink, CircleDashed, CheckCircle2, XCircle } from "lucide-react";
import { prisma } from "@/lib/db";
import { GateActions } from "../gate-actions";
import { GateChat } from "../gate-chat";
import { GATE_RESPONDER, supportsGateChat } from "@/lib/gate-chat/prompt";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  PM: "PM",
  TECH_LEAD: "Tech Lead",
  DB_EXPERT: "DB Expert",
};

export default async function ProjectGatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { gates: { orderBy: { createdAt: "desc" } } },
  });
  if (!project) notFound();

  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Validation gates</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review, discuss, and approve each step to advance the project.
        </p>
      </header>

      {project.gates.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <CircleDashed className="mx-auto size-6 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No gates yet.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {project.gates.map((g) => {
            const responder = GATE_RESPONDER[g.kind];
            const agentLabel = responder ? ROLE_LABEL[responder] ?? responder : "agent";
            return (
              <Card key={g.id} className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px] h-5">
                        {g.kind}
                      </Badge>
                      <span className="text-sm font-medium truncate">{g.title}</span>
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
    </div>
  );
}

function GateBadge({ status, decision }: { status: string; decision: string | null }) {
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
