"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Shared markdown renderer with light-mode-friendly styling via Tailwind
 * arbitrary selectors. Two density variants so we can use it in both
 * content pages (readable) and chat bubbles (tight).
 */
export function Markdown({
  children,
  variant = "content",
  className,
}: {
  children: string;
  variant?: "content" | "chat";
  className?: string;
}) {
  const styles =
    variant === "content" ? contentStyles : chatStyles;
  return (
    <div className={cn(styles, className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

const contentStyles = cn(
  "text-sm leading-relaxed text-foreground space-y-3 break-words",
  "[&_p]:my-0 [&_p]:leading-relaxed",
  "[&_strong]:font-semibold",
  "[&_em]:italic",
  "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1",
  "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:space-y-1",
  "[&_li]:leading-relaxed",
  "[&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_code]:border [&_code]:border-border",
  "[&_pre]:bg-muted [&_pre]:border [&_pre]:border-border [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:my-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:border-0 [&_pre_code]:text-xs",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground [&_blockquote]:my-3",
  "[&_h1]:text-xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:mt-6 [&_h1]:mb-3",
  "[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:mt-5 [&_h2]:mb-2",
  "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2",
  "[&_h4]:text-sm [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1.5",
  "[&_hr]:border-border [&_hr]:my-4",
  "[&_table]:w-full [&_table]:text-sm [&_table]:border [&_table]:border-border [&_table]:my-3",
  "[&_th]:border [&_th]:border-border [&_th]:px-3 [&_th]:py-1.5 [&_th]:font-semibold [&_th]:bg-muted [&_th]:text-left",
  "[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-1.5",
);

const chatStyles = cn(
  "text-sm leading-relaxed space-y-2 break-words",
  "[&_p]:my-0 [&_p]:leading-relaxed",
  "[&_strong]:font-semibold",
  "[&_em]:italic",
  "[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1",
  "[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1",
  "[&_code]:bg-background [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-xs [&_code]:font-mono [&_code]:border [&_code]:border-border",
  "[&_pre]:bg-background [&_pre]:border [&_pre]:border-border [&_pre]:p-3 [&_pre]:rounded-md [&_pre]:overflow-x-auto [&_pre]:my-2",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:border-0",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
);
