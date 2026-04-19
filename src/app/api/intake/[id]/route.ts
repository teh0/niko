import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await prisma.intakeSession.findUnique({
    where: { id },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!session) return new Response("not found", { status: 404 });
  // Normalize BigInt for JSON transport.
  return Response.json({
    ...session,
    installationId: session.installationId?.toString() ?? null,
  });
}
