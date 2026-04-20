"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { RunRow, relativeTime, type GroupedRuns } from "./shared";

/** Clickable role filter chips — drive via ?role=X search param. */
export function RoleFilter({
  roles,
  active,
  projectId,
}: {
  roles: string[];
  active?: string;
  projectId: string;
}) {
  const base = `/projects/${projectId}/runs`;
  return (
    <div className="flex flex-wrap gap-1.5 mb-6">
      <Link
        href={base}
        className={cn(
          "text-xs px-2.5 py-1 rounded-full border transition-colors",
          !active
            ? "bg-foreground text-background border-foreground"
            : "bg-background text-muted-foreground border-border hover:border-foreground/30",
        )}
      >
        all
      </Link>
      {roles.map((r) => (
        <Link
          key={r}
          href={`${base}?role=${encodeURIComponent(r)}`}
          className={cn(
            "text-xs px-2.5 py-1 rounded-full border font-mono transition-colors",
            active === r
              ? "bg-foreground text-background border-foreground"
              : "bg-background text-muted-foreground border-border hover:border-foreground/30",
          )}
        >
          {r}
        </Link>
      ))}
    </div>
  );
}

/** A group of consecutive runs with same (role, task). Collapsed by default when > 1. */
export function RunGroup({
  group,
  projectId,
}: {
  group: GroupedRuns;
  projectId: string;
}) {
  const multi = group.runs.length > 1;
  const [open, setOpen] = useState(!multi);
  const latest = group.runs[0];

  const parts: string[] = [];
  if (group.statusMix.SUCCEEDED) parts.push(`${group.statusMix.SUCCEEDED} ok`);
  if (group.statusMix.FAILED) parts.push(`${group.statusMix.FAILED} failed`);
  if (group.statusMix.CANCELLED)
    parts.push(`${group.statusMix.CANCELLED} cancelled`);

  const mixIcon = group.statusMix.FAILED ? XCircle : CheckCircle2;
  const mixColor = group.statusMix.FAILED
    ? group.statusMix.SUCCEEDED
      ? "text-amber-600"
      : "text-red-600"
    : "text-emerald-600";

  if (!multi) {
    return (
      <Card className="divide-y divide-border">
        <RunRow run={latest} projectId={projectId} />
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="shrink-0 text-muted-foreground">
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className="font-mono text-[10px]">
              {group.role}
            </Badge>
            <span className="text-sm font-medium truncate">{group.task}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground flex items-center gap-2 flex-wrap">
            <span className="font-semibold">{group.runs.length} iterations</span>
            <span>· latest {relativeTime(group.latestCreatedAt)}</span>
            <span>·</span>
            <IconInline Icon={mixIcon} className={mixColor} />
            <span className={mixColor}>{parts.join(" · ")}</span>
          </div>
        </div>
      </button>
      {open && (
        <div className="divide-y divide-border border-t border-border bg-muted/20">
          {group.runs.map((r) => (
            <RunRow key={r.id} run={r} projectId={projectId} compact />
          ))}
        </div>
      )}
    </Card>
  );
}

function IconInline({
  Icon,
  className,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return <Icon className={cn("size-3", className)} />;
}
