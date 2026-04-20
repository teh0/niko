import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { ProjectSidebar } from "./sidebar";
import { PmChat } from "./pm-chat";

export const dynamic = "force-dynamic";

export default async function ProjectLayout({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      _count: {
        select: { gates: true, tickets: true, pullRequests: true, agentRuns: true },
      },
    },
  });
  if (!project) notFound();

  const pendingGates = await prisma.gate.count({
    where: { projectId: id, status: "PENDING" },
  });

  const allProjects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, githubOwner: true, githubRepo: true },
  });

  return (
    <div className="grid grid-cols-[240px_1fr] min-h-[calc(100vh-56px)]">
      <ProjectSidebar
        projectId={id}
        projectName={project.name}
        projectRepo={`${project.githubOwner}/${project.githubRepo}`}
        projectStatus={project.status}
        allProjects={allProjects}
        counts={{
          pendingGates,
          tickets: project._count.tickets,
          runs: project._count.agentRuns,
        }}
      />
      <div className="min-w-0">{children}</div>
      <PmChat projectId={id} />
    </div>
  );
}
