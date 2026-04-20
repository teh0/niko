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

      try {
        for await (const ev of streamGateReply(gate, gate.messages, content)) {
          if (ev.type === "delta") {
            send({ type: "delta", text: ev.text });
          } else if (ev.type === "error") {
            send({ type: "error", message: ev.message });
          } else if (ev.type === "done") {
            const saved = await prisma.gateMessage.create({
              data: { gateId: id, role: "AGENT", content: ev.fullText },
            });
            send({
              type: "done",
              messageId: saved.id,
              suggestsApproval: /SUGGESTION:\s*approve/i.test(ev.fullText),
            });
          }
        }
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
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
