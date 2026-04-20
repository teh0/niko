"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const PREVIEW_CHARS = 400;

/** Tool results can be huge (file reads, bash output). Preview + expand. */
export function ToolResult({
  content,
  isError,
}: {
  content: string;
  isError?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const long = content.length > PREVIEW_CHARS;
  const preview = long ? content.slice(0, PREVIEW_CHARS) + "…" : content;

  const toneCls = isError
    ? "border-red-200 bg-red-50/40"
    : "border-border bg-muted/20";

  return (
    <Card className={cn("p-3", toneCls)}>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
          {isError ? "tool error" : "tool result"}
        </span>
        {long && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground ml-auto"
          >
            {open ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
            {open ? "collapse" : "expand"} ({content.length.toLocaleString()} chars)
          </button>
        )}
      </div>
      <pre
        className={cn(
          "text-[11px] font-mono whitespace-pre-wrap break-all",
          isError ? "text-red-700" : "text-muted-foreground",
          open ? "max-h-[32rem] overflow-y-auto" : "",
        )}
      >
        {open ? content : preview}
      </pre>
    </Card>
  );
}
