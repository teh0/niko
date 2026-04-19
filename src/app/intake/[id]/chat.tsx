"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

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

        // Parse SSE events (blank-line separated).
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
    <div className="flex flex-col h-full border border-border rounded-md bg-panel/30 overflow-hidden">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((m) => (
          <Bubble key={m.id} msg={m} />
        ))}
        {pending && (
          <Bubble msg={{ id: "pending", role: "AGENT", content: pending }} streaming />
        )}
        <div ref={bottomRef} />
      </div>

      {readyToFinalize ? (
        <div className="border-t border-border p-4 bg-panel">
          <div className="text-sm mb-2">
            The agent thinks it has enough info. Review the brief in the last message
            and kick off the project.
          </div>
          <div className="flex gap-2 items-center">
            <input
              value={installationId}
              onChange={(e) => setInstallationId(e.target.value)}
              placeholder="GitHub App installation id (optional)"
              className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm font-mono"
            />
            <button
              onClick={finalize}
              className="bg-accent text-white text-sm px-4 py-2 rounded-md hover:opacity-90"
            >
              Create project
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={send} className="border-t border-border p-3 flex gap-2">
          <input
            name="content"
            autoComplete="off"
            disabled={streaming || status === "FINALIZED"}
            placeholder={streaming ? "Agent is typing…" : "Your answer…"}
            className="flex-1 bg-bg border border-border rounded-md px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={streaming || status === "FINALIZED"}
            className="bg-accent text-white text-sm px-4 py-2 rounded-md hover:opacity-90 disabled:opacity-50"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}

function Bubble({ msg, streaming }: { msg: Msg; streaming?: boolean }) {
  if (msg.role === "SYSTEM") {
    return (
      <div className="text-xs text-danger border border-danger/40 bg-danger/10 rounded-md px-3 py-2">
        {msg.content}
      </div>
    );
  }
  const isUser = msg.role === "USER";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-md px-3 py-2 text-sm whitespace-pre-wrap ${
          isUser ? "bg-accent text-white" : "bg-panel border border-border"
        }`}
      >
        {msg.content}
        {streaming && <span className="inline-block w-1 h-4 ml-0.5 bg-current animate-pulse align-middle" />}
      </div>
    </div>
  );
}
