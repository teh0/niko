import { cn } from "@/lib/utils";

/** Animated three-dot 'agent is thinking' indicator, ChatGPT-style. */
export function TypingDots({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 py-1.5", className)}
      aria-label="Agent is thinking"
    >
      <span className="size-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:0ms] [animation-duration:1s]" />
      <span className="size-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:150ms] [animation-duration:1s]" />
      <span className="size-1.5 rounded-full bg-current opacity-60 animate-bounce [animation-delay:300ms] [animation-duration:1s]" />
    </span>
  );
}
