"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Manual gate decision controls — for local testing without a public
 * GitHub webhook. In prod, GitHub PR reviews trigger the same updates
 * via the webhook route.
 */
export function GateActions({ gateId }: { gateId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function decide(decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED") {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/gates/${gateId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          feedback: decision === "APPROVED" ? undefined : feedback || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      alert("Failed: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
      setFeedbackOpen(false);
      setFeedback("");
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={() => decide("APPROVED")}
        disabled={busy}
        className="text-xs px-2 py-1 rounded bg-ok/20 text-ok border border-ok/40 hover:bg-ok/30 disabled:opacity-50"
      >
        Approve
      </button>
      {feedbackOpen ? (
        <>
          <input
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Feedback…"
            className="text-xs bg-bg border border-border rounded px-2 py-1 w-48"
          />
          <button
            onClick={() => decide("CHANGES_REQUESTED")}
            disabled={busy}
            className="text-xs px-2 py-1 rounded bg-warn/20 text-warn border border-warn/40"
          >
            Send
          </button>
          <button
            onClick={() => setFeedbackOpen(false)}
            className="text-xs text-muted hover:text-fg"
          >
            ×
          </button>
        </>
      ) : (
        <button
          onClick={() => setFeedbackOpen(true)}
          disabled={busy}
          className="text-xs px-2 py-1 rounded bg-warn/20 text-warn border border-warn/40 hover:bg-warn/30 disabled:opacity-50"
        >
          Request changes
        </button>
      )}
    </div>
  );
}
