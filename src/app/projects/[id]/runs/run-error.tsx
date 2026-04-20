"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export function RunErrorDetail({ error }: { error: string }) {
  const [open, setOpen] = useState(false);
  const preview = error.split("\n")[0].slice(0, 120);
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
        <pre className="mt-1 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5 whitespace-pre-wrap break-all max-h-60 overflow-y-auto">
          {error}
        </pre>
      )}
    </div>
  );
}
