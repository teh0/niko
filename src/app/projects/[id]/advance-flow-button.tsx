"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Explicit "unstick the flow" button. Calls POST /api/projects/:id/advance
 * which invokes decideNext() and enqueues the next agent. Useful when a
 * run silently succeeded without producing a gate or when BullMQ retries
 * exhausted and the user needs to kick things back into motion without
 * touching the CLI.
 */
export function AdvanceFlowButton({
  projectId,
  variant = "default",
  label = "Relancer le flow",
  className,
}: {
  projectId: string;
  variant?: "default" | "outline" | "secondary";
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function advance() {
    if (pending) return;
    setPending(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/advance`, {
        method: "POST",
      });
      if (!res.ok) {
        alert("Échec : " + (await res.text()));
        return;
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      variant={variant}
      onClick={advance}
      disabled={pending}
      className={className}
      size="sm"
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Play className="size-3.5" />
      )}
      {pending ? "Relancement…" : label}
    </Button>
  );
}
