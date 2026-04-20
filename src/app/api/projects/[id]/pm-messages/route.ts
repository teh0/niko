import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const messages = await prisma.projectMessage.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, createdTicketIds: true, createdAt: true },
  });
  return Response.json({ messages });
}
