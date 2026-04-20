"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, MessageSquareText, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PendingAction = null | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";

export function GateActions({ gateId }: { gateId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedback, setFeedback] = useState("");

  const busy = pending !== null;

  async function decide(decision: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED") {
    if (busy) return;
    setPending(decision);
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
      alert("Échec : " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setPending(null);
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
            disabled={busy}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => decide("CHANGES_REQUESTED")}
            disabled={busy}
          >
            {pending === "CHANGES_REQUESTED" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : null}
            {pending === "CHANGES_REQUESTED" ? "Envoi…" : "Envoyer"}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setFeedbackOpen(false)}
            disabled={busy}
          >
            <X className="size-4" />
          </Button>
        </>
      ) : (
        <>
          <Button size="sm" onClick={() => decide("APPROVED")} disabled={busy}>
            {pending === "APPROVED" ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {pending === "APPROVED" ? "Approbation…" : "Approuver"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setFeedbackOpen(true)}
            disabled={busy}
          >
            <MessageSquareText className="size-3.5" />
            Demander des changements
          </Button>
        </>
      )}
    </div>
  );
}
