import { notFound } from "next/navigation";
import { Check } from "lucide-react";
import { prisma } from "@/lib/db";
import { IntakeChat } from "./chat";
import { INTAKE_COVERAGE } from "@/lib/intake/prompt";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function IntakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await prisma.intakeSession.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!session) notFound();

  const coverage = (session.coverage as Record<string, { done?: boolean }> | null) ?? {};
  const doneCount = INTAKE_COVERAGE.filter((c) => coverage[c.slug]?.done).length;

  return (
    <div className="grid grid-cols-[1fr_300px] gap-6 px-6 py-6 max-w-6xl mx-auto h-[calc(100vh-56px)]">
      <IntakeChat
        sessionId={session.id}
        initialMessages={session.messages.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        }))}
        initialStatus={session.status}
        initialReady={session.status === "READY_TO_FINALIZE"}
      />

      <aside className="space-y-4 sticky top-20 h-fit">
        <Card className="p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Coverage
            </h2>
            <span className="text-xs tabular-nums text-muted-foreground">
              {doneCount} / {INTAKE_COVERAGE.length}
            </span>
          </div>
          <div className="h-1 bg-muted rounded-full overflow-hidden mb-5">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${(doneCount / INTAKE_COVERAGE.length) * 100}%` }}
            />
          </div>
          <ul className="space-y-2.5 text-xs">
            {INTAKE_COVERAGE.map((item) => {
              const done = coverage[item.slug]?.done === true;
              return (
                <li key={item.slug} className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-0.5 inline-flex items-center justify-center size-4 rounded border shrink-0 transition-colors",
                      done
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-border bg-background",
                    )}
                  >
                    {done && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className={done ? "text-foreground" : "text-muted-foreground"}>
                    {item.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      </aside>
    </div>
  );
}
