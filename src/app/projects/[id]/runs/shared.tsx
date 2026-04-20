import Link from "next/link";
import {
  CheckCircle2,
  XCircle,
  CircleDashed,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RunErrorDetail } from "./run-error";

export type RunLite = {
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

export type GroupedRuns = {
  key: string;
  role: string;
  task: string;
  runs: RunLite[];
  statusMix: Record<string, number>;
  latestCreatedAt: Date;
};

export function RunRow({
  run,
  projectId,
  live,
  compact,
}: {
  run: RunLite;
  projectId: string;
  live?: boolean;
  compact?: boolean;
}) {
  const { Icon, color, bg } = statusStyle(run.status);
  const duration =
    run.startedAt &&
    formatDuration(
      new Date(run.endedAt ?? new Date()).getTime() -
        new Date(run.startedAt).getTime(),
    );

  return (
    <div
      className={cn(
        "group flex items-start gap-3 hover:bg-muted/40 transition-colors min-w-0",
        compact ? "px-3 py-2" : "px-4 py-3",
      )}
    >
      <div
        className={cn(
          "mt-0.5 shrink-0 rounded-full flex items-center justify-center",
          bg,
          compact ? "size-6" : "size-8",
        )}
      >
        <Icon
          className={cn(compact ? "size-3" : "size-4", color, live && "animate-spin")}
        />
      </div>
      <div className="min-w-0 flex-1">
        <Link href={`/projects/${projectId}/runs/${run.id}`} className="block">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-[10px]">
              {run.role}
            </Badge>
            <span
              className={cn(
                "truncate font-medium group-hover:text-primary transition-colors",
                compact ? "text-xs" : "text-sm",
              )}
            >
              {run.task}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
            <span className={cn("uppercase tracking-wider font-mono", color)}>
              {run.status.toLowerCase()}
            </span>
            <span>· {relativeTime(run.createdAt)}</span>
            {duration && <span>· {duration}</span>}
            {run.tokensIn != null && run.tokensOut != null && (
              <span>
                · {(run.tokensIn + run.tokensOut).toLocaleString()} tokens
              </span>
            )}
          </div>
        </Link>
        {run.error && (
          <RunErrorDetail
            error={run.error}
            runId={run.id}
            retryable={run.status !== "RUNNING" && run.status !== "QUEUED"}
          />
        )}
      </div>
    </div>
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

export function relativeTime(date: Date | string): string {
  const diff = Date.now() - new Date(date).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return s % 60 ? `${m}m ${s % 60}s` : `${m}m`;
}
