"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RunErrorDetail({
  error,
  runId,
  retryable,
}: {
  error: string;
  runId?: string;
  retryable?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const preview = error.split("\n")[0].slice(0, 140);

  async function retry() {
    if (!runId || retrying) return;
    setRetrying(true);
    try {
      const res = await fetch(`/api/runs/${runId}/retry`, { method: "POST" });
      if (!res.ok) {
        alert("Retry failed: " + (await res.text()));
        return;
      }
      router.refresh();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-start gap-1.5 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 w-full text-left hover:bg-red-100 transition-colors"
      >
        {open ? (
          <ChevronDown className="size-3 mt-0.5 shrink-0" />
        ) : (
          <ChevronRight className="size-3 mt-0.5 shrink-0" />
        )}
        <span className="font-mono flex-1 min-w-0 truncate">{preview}</span>
      </button>
      {open && (
        <>
          <pre className="mt-1 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
            {error}
          </pre>
          {retryable && runId && (
            <Button
              size="sm"
              variant="outline"
              onClick={retry}
              disabled={retrying}
              className="mt-2 h-7 text-xs"
            >
              <RotateCcw className={`size-3 ${retrying ? "animate-spin" : ""}`} />
              {retrying ? "Retrying…" : "Retry this run"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
