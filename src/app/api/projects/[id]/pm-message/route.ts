import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { streamPmReply, extractProposedTickets } from "@/lib/pm-chat/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { content?: string };
  const content = (body.content ?? "").trim();
  if (!content) return new Response("empty message", { status: 400 });

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      tickets: true,
      gates: { orderBy: { createdAt: "desc" }, take: 10 },
      pmMessages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!project) return new Response("not found", { status: 404 });

  await prisma.projectMessage.create({
    data: { projectId: id, role: "USER", content },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));

      try {
        for await (const ev of streamPmReply(
          {
            project,
            tickets: project.tickets,
            gates: project.gates,
          },
          project.pmMessages,
          content,
        )) {
          if (ev.type === "delta") {
            send({ type: "delta", text: ev.text });
          } else if (ev.type === "error") {
            send({ type: "error", message: ev.message });
          } else if (ev.type === "done") {
            // Parse proposed tickets and persist them.
            const proposed = extractProposedTickets(ev.fullText);
            const titleToId = new Map<string, string>();

            // First pass — create without deps, collect ids.
            for (const t of proposed) {
              const row = await prisma.ticket.create({
                data: {
                  projectId: id,
                  title: t.title,
                  description: t.description,
                  role: t.role,
                  priority: t.priority ?? 0,
                  dependsOn: [],
                  status: "TODO",
                },
              });
              titleToId.set(t.title, row.id);
            }
            // Second pass — resolve intra-batch dependencies by title.
            for (const t of proposed) {
              if (!t.dependsOn?.length) continue;
              const id2 = titleToId.get(t.title);
              if (!id2) continue;
              const deps = t.dependsOn
                .map((dep) => titleToId.get(dep))
                .filter((x): x is string => Boolean(x));
              if (deps.length) {
                await prisma.ticket.update({
                  where: { id: id2 },
                  data: { dependsOn: deps },
                });
              }
            }

            const saved = await prisma.projectMessage.create({
              data: {
                projectId: id,
                role: "AGENT",
                content: ev.fullText,
                createdTicketIds: Array.from(titleToId.values()),
              },
            });

            send({
              type: "done",
              messageId: saved.id,
              ticketsCreated: titleToId.size,
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
