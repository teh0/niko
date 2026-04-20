import { notFound } from "next/navigation";
import { CheckCircle2, XCircle, Activity, CircleDashed } from "lucide-react";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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

  return (
    <div className="px-8 py-8 max-w-4xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Agent runs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every time an agent picked up a task — queued, running, succeeded, or failed.
        </p>
      </header>

      {project.agentRuns.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <Activity className="mx-auto size-6 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {project.agentRuns.map((r) => {
            const Icon =
              r.status === "SUCCEEDED"
                ? CheckCircle2
                : r.status === "FAILED"
                  ? XCircle
                  : r.status === "RUNNING"
                    ? Activity
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
              <div key={r.id} className="px-4 py-3 flex items-start gap-3">
                <Icon className={cn("size-4 mt-0.5 shrink-0", color)} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {r.role}
                    </Badge>
                    <span className="text-sm font-medium truncate">{r.task}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                    <span className="uppercase tracking-wider font-mono">
                      {r.status}
                    </span>
                    {r.startedAt && (
                      <span>· started {new Date(r.startedAt).toLocaleString()}</span>
                    )}
                    {r.tokensIn != null && r.tokensOut != null && (
                      <span>
                        · {r.tokensIn.toLocaleString()} in / {r.tokensOut.toLocaleString()} out
                      </span>
                    )}
                  </div>
                  {r.error && (
                    <div className="mt-1.5 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1">
                      {r.error}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
