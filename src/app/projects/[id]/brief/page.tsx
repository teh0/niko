import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Markdown } from "@/components/markdown";

export const dynamic = "force-dynamic";

export default async function ProjectBriefPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  return (
    <div className="px-8 py-8 max-w-3xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Brief</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The final brief produced by the Intake agent when the project was created.
        </p>
      </header>
      <Card className="p-8">
        <Markdown>{project.brief}</Markdown>
      </Card>
    </div>
  );
}
