import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

async function start() {
  "use server";
  const session = await prisma.intakeSession.create({
    data: {
      status: "IN_PROGRESS",
      messages: {
        create: {
          role: "AGENT",
          content:
            "Salut ! Je suis l'agent Client Success de Niko. Je vais te poser quelques questions pour bien comprendre ton projet avant qu'on attaque la conception. On y va en douceur — une question à la fois.\n\nPour commencer : **parle-moi de l'idée en une ou deux phrases**. Qu'est-ce que tu veux construire ?",
        },
      },
    },
  });
  redirect(`/intake/${session.id}`);
}

export default function NewIntakePage() {
  return (
    <div className="px-6 py-14 max-w-xl mx-auto">
      <Card className="p-8">
        <div className="flex items-center gap-2 text-primary mb-4">
          <Sparkles className="size-4" />
          <span className="text-xs font-semibold uppercase tracking-wider">
            New project
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Let&rsquo;s scope your project
        </h1>
        <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
          You&rsquo;ll chat with our Client Success agent. They&rsquo;ll ask
          focused questions until engineering has what they need to start.
          Takes about 5 minutes.
        </p>
        <form action={start} className="mt-6">
          <Button type="submit" size="lg">
            Start the intake
          </Button>
        </form>
      </Card>
    </div>
  );
}
