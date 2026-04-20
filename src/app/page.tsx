import Link from "next/link";
import { ArrowUpRight, Folder } from "lucide-react";
import { prisma } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function ProjectsListPage() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      _count: { select: { gates: true, tickets: true, pullRequests: true } },
    },
  });

  return (
    <div className="px-6 py-10 max-w-5xl mx-auto">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every engagement the studio is working on.
        </p>
      </div>

      {projects.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <Folder className="mx-auto size-6 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No projects yet</p>
          <p className="text-sm text-muted-foreground mt-1">
            Start a new project to begin an engagement.
          </p>
        </Card>
      ) : (
        <div className="grid gap-2">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="group block">
              <Card className="p-4 transition-all hover:border-foreground/20 hover:shadow-sm">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      <ArrowUpRight className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <div className="text-xs text-muted-foreground font-mono mt-0.5">
                      {p.githubOwner}/{p.githubRepo}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {p._count.gates} gates · {p._count.pullRequests} PRs
                    </div>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {p.status}
                    </Badge>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
