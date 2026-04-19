import { prisma } from "@/lib/db";
import { getConnection } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks: Record<string, "ok" | string> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = "ok";
  } catch (err) {
    checks.db = err instanceof Error ? err.message : "error";
  }

  try {
    await getConnection().ping();
    checks.redis = "ok";
  } catch (err) {
    checks.redis = err instanceof Error ? err.message : "error";
  }

  const ok = Object.values(checks).every((v) => v === "ok");
  return Response.json(
    { status: ok ? "ok" : "degraded", checks, ts: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
