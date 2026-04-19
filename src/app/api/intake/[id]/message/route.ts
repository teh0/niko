import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import {
  streamIntakeReply,
  extractFinalBrief,
  looksReadyToFinalize,
} from "@/lib/intake/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Send a user message. Response is SSE: each chunk is `data: {...}\n\n`.
 * Event shapes (JSON payload):
 *   { type: "delta", text: "..." }
 *   { type: "done", messageId: "...", readyToFinalize: bool }
 *   { type: "error", message: "..." }
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { content?: string };
  const content = (body.content ?? "").trim();

  if (!content) {
    return new Response("empty message", { status: 400 });
  }

  const session = await prisma.intakeSession.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!session) return new Response("not found", { status: 404 });
  if (session.status !== "IN_PROGRESS" && session.status !== "READY_TO_FINALIZE") {
    return new Response("session closed", { status: 409 });
  }

  // Persist the user's message before we call the model.
  await prisma.intakeMessage.create({
    data: { sessionId: id, role: "USER", content },
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

      try {
        for await (const ev of streamIntakeReply(session.messages, content)) {
          if (ev.type === "delta") {
            send({ type: "delta", text: ev.text });
          } else if (ev.type === "error") {
            send({ type: "error", message: ev.message });
          } else if (ev.type === "done") {
            const saved = await prisma.intakeMessage.create({
              data: { sessionId: id, role: "AGENT", content: ev.fullText },
            });

            const final = extractFinalBrief(ev.fullText);
            const ready = looksReadyToFinalize(ev.fullText);

            if (final || ready) {
              const update: Record<string, unknown> = { status: "READY_TO_FINALIZE" };
              if (final) {
                update.name = final.name;
                update.finalBrief = final.brief;
                update.coverage = final.coverage as never;
                const [owner, repo] = (final.githubRepo ?? "").split("/");
                if (owner && repo) {
                  update.githubOwner = owner;
                  update.githubRepo = repo;
                }
                update.figmaUrl = final.figmaUrl ?? null;
              }
              await prisma.intakeSession.update({ where: { id }, data: update });
            }

            send({
              type: "done",
              messageId: saved.id,
              readyToFinalize: Boolean(final) || ready,
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
