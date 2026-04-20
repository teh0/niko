"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Send, MessageCircle, X, Sparkles, Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TypingDots } from "@/components/typing-dots";
import { cn } from "@/lib/utils";

type Msg = {
  id: string;
  role: "USER" | "AGENT" | "SYSTEM";
  content: string;
  createdTicketIds?: string[];
};

/**
 * Slide-out panel for the project-level PM chat. Users tap a floating
 * button to open it; they can ask questions and agree on new tickets.
 */
export function PmChat({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pending, setPending] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  useEffect(() => {
    if (!open || loaded) return;
    (async () => {
      const res = await fetch(`/api/projects/${projectId}/pm-messages`);
      if (!res.ok) return;
      const { messages } = (await res.json()) as { messages: Msg[] };
      setMessages(messages);
      setLoaded(true);
    })();
  }, [open, loaded, projectId]);

  const visibleMessages = useMemo(() => {
    const out: Msg[] = [];
    for (const m of messages) {
      const prev = out[out.length - 1];
      if (prev && prev.role === m.role && prev.content === m.content) continue;
      out.push(m);
    }
    return out;
  }, [messages]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const input = form.elements.namedItem("content") as HTMLInputElement;
    const content = input.value.trim();
    if (!content || streaming) return;

    setMessages((m) => [...m, { id: `tmp-${Date.now()}`, role: "USER", content }]);
    input.value = "";
    setStreaming(true);
    setPending("");

    try {
      const res = await fetch(`/api/projects/${projectId}/pm-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.body) throw new Error("no response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullText = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const payload = JSON.parse(part.slice(6));
          if (payload.type === "delta") {
            fullText += payload.text;
            setPending(fullText);
          } else if (payload.type === "done") {
            setMessages((m) => [
              ...m,
              {
                id: payload.messageId,
                role: "AGENT",
                content: fullText,
                createdTicketIds:
                  payload.ticketsCreated > 0 ? new Array(payload.ticketsCreated).fill("") : [],
              },
            ]);
            setPending("");
            if (payload.ticketsCreated > 0) {
              // refresh the page to show new tickets in the kanban
              router.refresh();
            }
          } else if (payload.type === "error") {
            setMessages((m) => [
              ...m,
              { id: `err-${Date.now()}`, role: "SYSTEM", content: `Error: ${payload.message}` },
            ]);
          }
        }
      }
    } finally {
      setStreaming(false);
    }
  }

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full px-4 h-12 shadow-lg transition-all",
          open
            ? "bg-foreground text-background"
            : "bg-primary text-primary-foreground hover:brightness-110",
        )}
      >
        {open ? <X className="size-4" /> : <MessageCircle className="size-4" />}
        <span className="text-sm font-medium">
          {open ? "Close" : "Talk to PM"}
        </span>
      </button>

      {/* Drawer */}
      {open && (
        <div className="fixed bottom-24 right-6 z-30 w-[420px] max-w-[calc(100vw-3rem)] h-[70vh] max-h-[640px] animate-in slide-in-from-bottom-4 fade-in duration-200">
          <Card className="flex flex-col h-full overflow-hidden shadow-2xl">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <div className="size-7 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Sparkles className="size-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Product Manager</div>
                <div className="text-[11px] text-muted-foreground">
                  Discuss scope, get help crafting tickets
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {visibleMessages.length === 0 && !pending && (
                <div className="text-center py-8">
                  <Sparkles className="mx-auto size-5 text-muted-foreground/40 mb-2" />
                  <div className="text-xs text-muted-foreground">
                    Ask me for a status update, propose a new feature, or report a bug.
                  </div>
                </div>
              )}
              {visibleMessages.map((m) => (
                <Bubble key={m.id} msg={m} />
              ))}
              {streaming && !pending && (
                <div className="flex gap-2 justify-start">
                  <div className="shrink-0 size-6 rounded-full bg-primary/10 text-primary flex items-center justify-center mt-0.5">
                    <Bot className="size-3" />
                  </div>
                  <div className="rounded-2xl rounded-bl-sm bg-muted border border-border text-muted-foreground px-3.5 py-2">
                    <TypingDots />
                  </div>
                </div>
              )}
              {pending && (
                <Bubble msg={{ id: "pending", role: "AGENT", content: pending }} streaming />
              )}
              <div ref={bottomRef} />
            </div>

            <form onSubmit={send} className="border-t border-border p-3 flex gap-2 bg-background">
              <Input
                name="content"
                autoComplete="off"
                disabled={streaming}
                placeholder={streaming ? "PM is typing…" : "Message the PM…"}
                className="text-sm"
              />
              <Button type="submit" disabled={streaming} size="icon">
                <Send className="size-4" />
              </Button>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}

function Bubble({ msg, streaming }: { msg: Msg; streaming?: boolean }) {
  if (msg.role === "SYSTEM") {
    return (
      <div className="text-xs text-destructive border border-destructive/30 bg-destructive/5 rounded-md px-3 py-2">
        {msg.content}
      </div>
    );
  }
  const isUser = msg.role === "USER";
  const ticketsCreated = msg.createdTicketIds?.length ?? 0;
  return (
    <div className={cn("flex gap-2", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="shrink-0 size-6 rounded-full bg-primary/10 text-primary flex items-center justify-center mt-0.5">
          <Bot className="size-3" />
        </div>
      )}
      <div className="max-w-[85%] min-w-0 space-y-2 break-words">
        <div
          className={cn(
            "rounded-2xl px-3.5 py-2 text-xs leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground whitespace-pre-wrap rounded-br-sm"
              : "bg-muted text-foreground border border-border rounded-bl-sm",
          )}
        >
          {isUser ? (
            msg.content
          ) : (
            <div
              className={cn(
                "space-y-1.5 [&_p]:my-0 [&_strong]:font-semibold",
                "[&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4",
                "[&_code]:bg-background [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-[10px] [&_code]:border [&_code]:border-border",
                "[&_pre]:hidden",
                "[&_a]:text-primary [&_a]:underline",
              )}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {stripJsonBlock(msg.content)}
              </ReactMarkdown>
            </div>
          )}
          {streaming && (
            <span className="inline-block w-1 h-3 ml-0.5 bg-current animate-pulse align-middle" />
          )}
        </div>
        {ticketsCreated > 0 && (
          <Badge
            variant="outline"
            className="text-[10px] bg-emerald-50 border-emerald-200 text-emerald-700"
          >
            {ticketsCreated} ticket{ticketsCreated > 1 ? "s" : ""} created
          </Badge>
        )}
      </div>
    </div>
  );
}

function stripJsonBlock(text: string): string {
  return text.replace(/```json\s*[\s\S]*?```/g, "").trim();
}
