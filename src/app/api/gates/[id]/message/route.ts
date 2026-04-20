import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { streamGateReply } from "@/lib/gate-chat/runtime";
import { supportsGateChat } from "@/lib/gate-chat/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { content?: string };
  const content = (body.content ?? "").trim();
  if (!content) return new Response("empty message", { status: 400 });

  const gate = await prisma.gate.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!gate) return new Response("not found", { status: 404 });
  if (!supportsGateChat(gate.kind)) {
    return new Response("chat not supported for this gate kind", { status: 400 });
  }
  if (gate.status !== "PENDING") {
    return new Response("gate already decided", { status: 409 });
  }

  await prisma.gateMessage.create({
    data: { gateId: id, role: "USER", content },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

      // Whatever tokens we've streamed so far. Even if the run crashes
      // half-way, we persist this on exit so the user doesn't reload the
      // page and see only their own messages.
      let accumulated = "";
      let savedNormally = false;
      let errorMsg: string | null = null;

      try {
        for await (const ev of streamGateReply(gate, gate.messages, content)) {
          if (ev.type === "delta") {
            accumulated += ev.text;
            send({ type: "delta", text: ev.text });
          } else if (ev.type === "error") {
            errorMsg = ev.message;
            send({ type: "error", message: ev.message });
          } else if (ev.type === "done") {
            accumulated = ev.fullText || accumulated;
            const saved = await prisma.gateMessage.create({
              data: { gateId: id, role: "AGENT", content: accumulated },
            });
            savedNormally = true;
            send({
              type: "done",
              messageId: saved.id,
              suggestsApproval: /SUGGESTION:\s*approve/i.test(accumulated),
            });
          }
        }
      } catch (err) {
        errorMsg = err instanceof Error ? err.message : String(err);
        send({ type: "error", message: errorMsg });
      } finally {
        // Persist partial progress on any exit path where 'done' didn't
        // fire. Better a half answer visible on reload than a void.
        if (!savedNormally && accumulated.trim().length > 0) {
          const note = errorMsg ? `\n\n_(Réponse interrompue : ${errorMsg})_` : "";
          await prisma.gateMessage.create({
            data: { gateId: id, role: "AGENT", content: accumulated + note },
          });
        } else if (!savedNormally && errorMsg) {
          await prisma.gateMessage.create({
            data: {
              gateId: id,
              role: "SYSTEM",
              content: `Réponse échouée : ${errorMsg}`,
            },
          });
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
