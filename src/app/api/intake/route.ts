import { prisma } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Create a new intake session and return its id. The UI then redirects the
 * user to /intake/[id] to start the chat.
 */
export async function POST() {
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
    include: { messages: true },
  });
  return Response.json({ id: session.id });
}
