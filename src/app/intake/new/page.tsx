import { redirect } from "next/navigation";
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
    <div className="p-6 max-w-2xl mx-auto">
      <Card className="p-6">
        <h1 className="text-2xl font-semibold mb-2">New project</h1>
        <p className="text-muted-foreground mb-6">
          You&rsquo;ll chat with our Client Success agent. They&rsquo;ll ask
          questions until they have what engineering needs to start. Takes ~5
          minutes.
        </p>
        <form action={start}>
          <Button type="submit">Start the intake</Button>
        </form>
      </Card>
    </div>
  );
}
