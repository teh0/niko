import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ProjectsListPage() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { gates: true, tickets: true, pullRequests: true } },
    },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Link
          href="/projects/new"
          className="bg-accent text-white text-sm px-3 py-2 rounded-md hover:opacity-90"
        >
          New project
        </Link>
      </div>

      {projects.length === 0 ? (
        <p className="text-muted">No projects yet. Create one to start a studio engagement.</p>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-md">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="flex items-center justify-between px-4 py-3 hover:bg-panel"
              >
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted font-mono">
                    {p.githubOwner}/{p.githubRepo}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="px-2 py-0.5 rounded bg-panel border border-border">
                    {p.status}
                  </span>
                  <span className="text-muted">
                    {p._count.gates} gates · {p._count.pullRequests} PRs
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
