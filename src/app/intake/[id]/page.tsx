import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { IntakeChat } from "./chat";
import { INTAKE_COVERAGE } from "@/lib/intake/prompt";
import { Card } from "@/components/ui/card";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function IntakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await prisma.intakeSession.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!session) notFound();

  return (
    <div className="grid grid-cols-[1fr_280px] gap-6 p-6 max-w-6xl mx-auto h-[calc(100vh-64px)]">
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

      <Card className="p-4 h-fit sticky top-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Coverage
        </h2>
        <ul className="space-y-2 text-xs">
          {INTAKE_COVERAGE.map((item) => {
            const cov = (session.coverage as Record<string, { done?: boolean }> | null)?.[
              item.slug
            ];
            const done = cov?.done === true;
            return (
              <li key={item.slug} className="flex items-start gap-2">
                <span
                  className={cn(
                    "mt-0.5 inline-flex items-center justify-center size-4 rounded-sm border shrink-0",
                    done
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-border",
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
    </div>
  );
}
