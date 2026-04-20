import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Kanban } from "../kanban";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ProjectBacklogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: { tickets: { orderBy: { priority: "asc" } } },
  });
  if (!project) notFound();

  return (
    <div className="px-8 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Backlog</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tickets the studio is working on. Talk to the PM (bottom-right) to add more.
        </p>
      </header>

      {project.tickets.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <p className="text-sm text-muted-foreground">
            Not broken down yet. The Tech Lead will create the initial tickets
            after the scaffold gate is approved, or you can talk to the PM to
            add one now.
          </p>
        </Card>
      ) : (
        <Kanban tickets={project.tickets} />
      )}
    </div>
  );
}
