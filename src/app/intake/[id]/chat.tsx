"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Msg = { id: string; role: "USER" | "AGENT" | "SYSTEM"; content: string };

export function IntakeChat({
  sessionId,
  initialMessages,
  initialStatus,
  initialReady,
}: {
  sessionId: string;
  initialMessages: Msg[];
  initialStatus: string;
  initialReady: boolean;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [pending, setPending] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [readyToFinalize, setReadyToFinalize] = useState(initialReady);
  const [installationId, setInstallationId] = useState("");
  const [status] = useState(initialStatus);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pending]);

  // Defensive dedup: if the same (role, content) shows up twice in a row
  // — which can happen when the optimistic user bubble overlaps with a
  // re-fetch — keep only the first occurrence.
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

    const userMsg: Msg = { id: `tmp-${Date.now()}`, role: "USER", content };
    setMessages((m) => [...m, userMsg]);
    input.value = "";
    setStreaming(true);
    setPending("");

    try {
      const res = await fetch(`/api/intake/${sessionId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.body) throw new Error("No response body");

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
            if (payload.readyToFinalize) setReadyToFinalize(true);
          } else if (payload.type === "error") {
            setMessages((m) => [
              ...m,
              {
                id: `err-${Date.now()}`,
                role: "SYSTEM",
                content: `Error: ${payload.message}`,
              },
            ]);
          }
        }
      }
    } finally {
      setStreaming(false);
    }
  }

  async function finalize() {
    const res = await fetch(`/api/intake/${sessionId}/finalize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ installationId: installationId || undefined }),
    });
    if (!res.ok) {
      alert("Could not finalize: " + (await res.text()));
      return;
    }
    const { projectId } = (await res.json()) as { projectId: string };
    router.push(`/projects/${projectId}`);
  }

  return (
    <Card className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {visibleMessages.map((m) => (
          <Bubble key={m.id} msg={m} />
        ))}
        {pending && (
          <Bubble msg={{ id: "pending", role: "AGENT", content: pending }} streaming />
        )}
        <div ref={bottomRef} />
      </div>

      {readyToFinalize ? (
        <div className="border-t border-border p-4 bg-muted-shadcn/10 space-y-3">
          <div className="text-sm">
            The agent thinks it has enough info. Review the brief in the last message
            and kick off the project.
          </div>
          <div className="flex gap-2 items-center">
            <Input
              value={installationId}
              onChange={(e) => setInstallationId(e.target.value)}
              placeholder="GitHub App installation id (optional)"
              className="font-mono"
            />
            <Button onClick={finalize}>Create project</Button>
          </div>
        </div>
      ) : (
        <form onSubmit={send} className="border-t border-border p-3 flex gap-2">
          <Input
            name="content"
            autoComplete="off"
            disabled={streaming || status === "FINALIZED"}
            placeholder={streaming ? "Agent is typing…" : "Your answer…"}
          />
          <Button
            type="submit"
            disabled={streaming || status === "FINALIZED"}
            size="icon"
          >
            <Send className="size-4" />
          </Button>
        </form>
      )}
    </Card>
  );
}

function Bubble({ msg, streaming }: { msg: Msg; streaming?: boolean }) {
  if (msg.role === "SYSTEM") {
    return (
      <div className="text-xs text-destructive border border-destructive/40 bg-destructive/10 rounded-md px-3 py-2">
        {msg.content}
      </div>
    );
  }
  const isUser = msg.role === "USER";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-md px-3 py-2 text-sm",
          isUser
            ? "bg-primary text-primary-foreground whitespace-pre-wrap"
            : "bg-card border border-border",
        )}
      >
        {isUser ? (
          msg.content
        ) : (
          <MarkdownContent>{msg.content}</MarkdownContent>
        )}
        {streaming && (
          <span className="inline-block w-1 h-4 ml-0.5 bg-current animate-pulse align-middle" />
        )}
      </div>
    </div>
  );
}

function MarkdownContent({ children }: { children: string }) {
  return (
    <div
      className={cn(
        // Prose-like styling built from Tailwind — keeps tight for a chat bubble.
        "space-y-2 [&>p]:leading-relaxed [&_p]:my-0",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_em]:italic",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1",
        "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1",
        "[&_li]:leading-relaxed",
        "[&_code]:bg-muted-shadcn [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono",
        "[&_pre]:bg-muted-shadcn [&_pre]:p-2 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-2",
        "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
        "[&_a]:text-primary [&_a]:underline",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
        "[&_h1]:text-base [&_h1]:font-semibold [&_h1]:mt-3 [&_h1]:mb-1",
        "[&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1",
        "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1",
        "[&_hr]:border-border [&_hr]:my-3",
        "[&_table]:w-full [&_table]:text-xs [&_table]:border [&_table]:border-border",
        "[&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:font-semibold",
        "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
