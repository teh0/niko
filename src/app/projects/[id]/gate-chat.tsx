"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { MessageSquare, Send, ChevronDown, ChevronRight } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TypingDots } from "@/components/typing-dots";
import { cn } from "@/lib/utils";

type Msg = { id: string; role: "USER" | "AGENT" | "SYSTEM"; content: string };

/**
 * Inline chat panel for a gate. Lets the user ask questions / propose
 * tweaks to the agent who produced this gate before deciding.
 */
export function GateChat({
  gateId,
  agentLabel,
  supportsChat,
  onSuggestApprove,
}: {
  gateId: string;
  agentLabel: string;
  supportsChat: boolean;
  onSuggestApprove?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pending, setPending] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  async function loadMessages() {
    const res = await fetch(`/api/gates/${gateId}/messages`);
    if (!res.ok) return;
    const { messages } = (await res.json()) as { messages: Msg[] };
    setMessages(messages);
    setLoaded(true);
  }

  useEffect(() => {
    if (open && !loaded) loadMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
      const res = await fetch(`/api/gates/${gateId}/message`, {
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
              { id: payload.messageId, role: "AGENT", content: fullText },
            ]);
            setPending("");
            if (payload.suggestsApproval) onSuggestApprove?.();
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

  if (!supportsChat) return null;

  return (
    <div className="mt-3 border-t border-border pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <MessageSquare className="size-3" />
        Discuss with {agentLabel}
        {messages.length > 0 && (
          <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-muted">
            {messages.length}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {visibleMessages.length === 0 && !pending && (
              <div className="text-xs text-muted-foreground italic">
                Ask a question, request an adjustment, or just say hi.
              </div>
            )}
            {visibleMessages.map((m) => (
              <GateBubble key={m.id} msg={m} />
            ))}
            {streaming && !pending && (
              <div className="flex justify-start">
                <div className="bg-muted border border-border rounded-xl rounded-bl-sm px-3 py-2 text-muted-foreground">
                  <TypingDots />
                </div>
              </div>
            )}
            {pending && (
              <GateBubble
                msg={{ id: "pending", role: "AGENT", content: pending }}
                streaming
              />
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={send} className="flex gap-2">
            <Input
              name="content"
              autoComplete="off"
              disabled={streaming}
              placeholder={streaming ? `${agentLabel} is typing…` : "Your message…"}
              className="text-xs h-8"
            />
            <Button type="submit" disabled={streaming} size="icon" className="size-8">
              <Send className="size-3.5" />
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}

function GateBubble({ msg, streaming }: { msg: Msg; streaming?: boolean }) {
  if (msg.role === "SYSTEM") {
    return (
      <div className="text-[11px] text-destructive border border-destructive/30 bg-destructive/5 rounded-md px-2 py-1">
        {msg.content}
      </div>
    );
  }
  const isUser = msg.role === "USER";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[90%] rounded-xl px-3 py-2 text-xs leading-relaxed break-words",
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
              "space-y-1 [&_p]:my-0 [&_strong]:font-semibold",
              "[&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4",
              "[&_code]:bg-background [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono [&_code]:text-[10px] [&_code]:border [&_code]:border-border",
              "[&_a]:text-primary [&_a]:underline",
            )}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {msg.content.replace(/\*\*SUGGESTION:\s*approve this gate\*\*/i, "")}
            </ReactMarkdown>
          </div>
        )}
        {streaming && (
          <span className="inline-block w-1 h-3 ml-0.5 bg-current animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
}
