"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageSquareText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      {feedbackOpen ? (
        <>
          <Input
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Feedback…"
            className="w-48 h-8 text-xs"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => decide("CHANGES_REQUESTED")}
            disabled={busy}
          >
            Send
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setFeedbackOpen(false)}
          >
            <X className="size-4" />
          </Button>
        </>
      ) : (
        <>
          <Button size="sm" onClick={() => decide("APPROVED")} disabled={busy}>
            <Check className="size-3.5" />
            Approve
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFeedbackOpen(true)}
            disabled={busy}
          >
            <MessageSquareText className="size-3.5" />
            Request changes
          </Button>
        </>
      )}
    </div>
  );
}
