import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Wrench,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  User,
} from "lucide-react";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";
import { cn } from "@/lib/utils";
import { AutoRefresh } from "../auto-refresh";
import { ToolResult } from "./tool-result";
import { fmtNumber, fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function RunDetailPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id, runId } = await params;
  const run = await prisma.agentRun.findUnique({ where: { id: runId } });
  if (!run || run.projectId !== id) notFound();

  const live = run.status === "RUNNING" || run.status === "QUEUED";
  // Show most recent first — on a live run the latest action is what you
  // care about, and you don't have to scroll to find it.
  const events = flattenTranscript(run.transcript).reverse();

  const duration = run.startedAt
    ? formatDuration(
        (run.endedAt ?? new Date()).getTime() - new Date(run.startedAt).getTime(),
      )
    : null;

  return (
    <div className="px-8 py-8 max-w-4xl">
      {live && <AutoRefresh intervalMs={2500} />}

      <Link
        href={`/projects/${id}/runs`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        <ArrowLeft className="size-3" />
        All runs
      </Link>

      <header className="mb-6 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="font-mono text-[10px]">
            {run.role}
          </Badge>
          <StatusPill status={run.status} />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{run.task}</h1>
        <div className="text-[11px] text-muted-foreground flex flex-wrap gap-2 items-center">
          <span>Créé le {fmtDateTime(run.createdAt)}</span>
          {duration && <span>· {duration}</span>}
          {run.tokensIn != null && run.tokensOut != null && (
            <span>
              · {fmtNumber(run.tokensIn)} / {fmtNumber(run.tokensOut)} tokens
            </span>
          )}
        </div>
      </header>

      {run.error && (
        <Card className="p-4 mb-6 border-red-200 bg-red-50">
          <div className="text-xs font-semibold text-red-800 mb-1">Error</div>
          <pre className="text-[11px] text-red-700 whitespace-pre-wrap break-all font-mono">
            {run.error}
          </pre>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-tight mb-2 flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          Activity
          <span className="text-xs text-muted-foreground font-normal">
            (newest first{live && " · live"})
          </span>
        </h2>
        {events.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <p className="text-sm text-muted-foreground">
              {live ? "Waiting for the agent to start…" : "No activity recorded."}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {events.map((ev, i) => (
              <EventBlock key={i} event={ev} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

type TranscriptEvent =
  | { kind: "text"; text: string }
  | { kind: "tool_use"; name: string; input: unknown }
  | { kind: "tool_result"; content: string; isError?: boolean }
  | { kind: "user"; text: string }
  | { kind: "system"; text: string }
  | { kind: "result"; subtype: string; text?: string };

/**
 * The transcript JSON from the Agent SDK is a mixed stream of messages.
 * We flatten it to a linear list of events the UI can render cleanly.
 */
function flattenTranscript(transcript: unknown): TranscriptEvent[] {
  if (!Array.isArray(transcript)) return [];
  const events: TranscriptEvent[] = [];
  for (const msg of transcript) {
    if (!msg || typeof msg !== "object") continue;
    const m = msg as Record<string, unknown>;
    const type = m.type as string;

    if (type === "assistant") {
      const content = ((m.message as { content?: unknown })?.content) ?? [];
      if (Array.isArray(content)) {
        for (const c of content) {
          if (!c || typeof c !== "object") continue;
          const blockType = (c as { type?: string }).type;
          if (blockType === "text") {
            const txt = (c as { text?: string }).text;
            if (txt) events.push({ kind: "text", text: txt });
          } else if (blockType === "tool_use") {
            const tu = c as { name?: string; input?: unknown };
            events.push({
              kind: "tool_use",
              name: tu.name ?? "tool",
              input: tu.input,
            });
          }
        }
      }
    } else if (type === "user") {
      const content = ((m.message as { content?: unknown })?.content) ?? [];
      if (Array.isArray(content)) {
        for (const c of content) {
          if (!c || typeof c !== "object") continue;
          const blockType = (c as { type?: string }).type;
          if (blockType === "tool_result") {
            const rawContent = (c as { content?: unknown }).content;
            const isError = Boolean((c as { is_error?: boolean }).is_error);
            let str = "";
            if (typeof rawContent === "string") str = rawContent;
            else if (Array.isArray(rawContent)) {
              str = rawContent
                .map((p) => {
                  if (typeof p === "object" && p !== null && "text" in p) {
                    return String((p as { text: unknown }).text);
                  }
                  return "";
                })
                .join("");
            }
            events.push({ kind: "tool_result", content: str, isError });
          } else if (blockType === "text") {
            const t = (c as { text?: string }).text;
            if (t) events.push({ kind: "user", text: t });
          }
        }
      } else if (typeof content === "string") {
        events.push({ kind: "user", text: content });
      }
    } else if (type === "system") {
      const txt =
        typeof m.subtype === "string" ? `[system: ${m.subtype}]` : "[system]";
      events.push({ kind: "system", text: txt });
    } else if (type === "result") {
      const subtype = (m.subtype as string) ?? "success";
      const text = typeof m.result === "string" ? m.result : undefined;
      events.push({ kind: "result", subtype, text });
    }
  }
  return events;
}

function EventBlock({ event }: { event: TranscriptEvent }) {
  if (event.kind === "text") {
    return (
      <div className="flex gap-3">
        <div className="shrink-0 size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center mt-1">
          <Bot className="size-3.5" />
        </div>
        <Card className="flex-1 min-w-0 p-3.5">
          <Markdown variant="chat">{event.text}</Markdown>
        </Card>
      </div>
    );
  }

  if (event.kind === "tool_use") {
    return (
      <div className="flex gap-3">
        <div className="shrink-0 size-7 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mt-1">
          <Wrench className="size-3.5 text-amber-700" />
        </div>
        <Card className="flex-1 min-w-0 p-3 bg-amber-50/40 border-amber-200/60">
          <div className="text-xs font-mono font-semibold text-amber-800 mb-1">
            {event.name}
          </div>
          {event.input != null && (
            <details className="mt-1">
              <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
                input
              </summary>
              <pre className="mt-1 text-[10px] font-mono whitespace-pre-wrap break-all text-muted-foreground bg-background/60 border border-border rounded p-2 max-h-40 overflow-y-auto">
                {safeJson(event.input)}
              </pre>
            </details>
          )}
        </Card>
      </div>
    );
  }

  if (event.kind === "tool_result") {
    return (
      <div className="flex gap-3">
        <div className="shrink-0 size-7 rounded-full bg-muted border border-border flex items-center justify-center mt-1">
          <Wrench className="size-3.5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <ToolResult content={event.content} isError={event.isError} />
        </div>
      </div>
    );
  }

  if (event.kind === "user") {
    return (
      <div className="flex gap-3">
        <div className="shrink-0 size-7 rounded-full bg-muted border border-border flex items-center justify-center mt-1">
          <User className="size-3.5 text-muted-foreground" />
        </div>
        <Card className="flex-1 min-w-0 p-3 bg-muted/40">
          <div className="text-xs whitespace-pre-wrap break-words">{event.text}</div>
        </Card>
      </div>
    );
  }

  if (event.kind === "system") {
    return (
      <div className="text-[10px] text-center text-muted-foreground italic py-1">
        {event.text}
      </div>
    );
  }

  if (event.kind === "result") {
    const ok = event.subtype === "success";
    const Icon = ok ? CheckCircle2 : XCircle;
    const color = ok ? "text-emerald-600" : "text-red-600";
    return (
      <div className={cn("flex gap-3 items-center", color)}>
        <div className="shrink-0 size-7 rounded-full bg-background border border-border flex items-center justify-center">
          <Icon className="size-4" />
        </div>
        <div className="text-xs font-semibold uppercase tracking-wider">
          {event.subtype}
        </div>
      </div>
    );
  }

  return null;
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "SUCCEEDED"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : status === "FAILED"
        ? "bg-red-50 text-red-700 border-red-200"
        : status === "RUNNING"
          ? "bg-blue-50 text-blue-700 border-blue-200"
          : "bg-muted text-muted-foreground border-border";
  const Icon =
    status === "SUCCEEDED"
      ? CheckCircle2
      : status === "FAILED"
        ? XCircle
        : status === "RUNNING"
          ? Loader2
          : null;
  return (
    <Badge variant="outline" className={cn("gap-1 text-[10px]", cls)}>
      {Icon && (
        <Icon
          className={cn("size-3", status === "RUNNING" && "animate-spin")}
        />
      )}
      {status.toLowerCase()}
    </Badge>
  );
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}
