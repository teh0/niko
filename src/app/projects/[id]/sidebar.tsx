"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard,
  FileText,
  Shield,
  Kanban,
  Activity,
  ExternalLink,
  ChevronsUpDown,
  Check,
  GitBranch,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  count?: number;
  badge?: "dot";
};

export function ProjectSidebar({
  projectId,
  projectName,
  projectRepo,
  projectStatus,
  allProjects,
  counts,
}: {
  projectId: string;
  projectName: string;
  projectRepo: string;
  projectStatus: string;
  allProjects: { id: string; name: string; githubOwner: string; githubRepo: string }[];
  counts: { pendingGates: number; tickets: number; runs: number };
}) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  const items: NavItem[] = [
    { href: base, label: "Overview", icon: LayoutDashboard },
    { href: `${base}/brief`, label: "Brief", icon: FileText },
    {
      href: `${base}/gates`,
      label: "Gates",
      icon: Shield,
      count: counts.pendingGates > 0 ? counts.pendingGates : undefined,
      badge: counts.pendingGates > 0 ? "dot" : undefined,
    },
    { href: `${base}/backlog`, label: "Backlog", icon: Kanban, count: counts.tickets },
    { href: `${base}/studio`, label: "Studio", icon: Users },
    { href: `${base}/runs`, label: "Agent runs", icon: Activity },
  ];

  return (
    <aside className="sticky top-14 self-start h-[calc(100vh-3.5rem)] border-r border-border bg-muted/30 flex flex-col">
      <div className="p-3">
        <ProjectSwitcher
          currentId={projectId}
          currentName={projectName}
          currentRepo={projectRepo}
          currentStatus={projectStatus}
          allProjects={allProjects}
        />
      </div>

      <nav className="px-2 flex-1 space-y-0.5">
        {items.map((it) => {
          const active =
            it.href === base
              ? pathname === it.href
              : pathname?.startsWith(it.href);
          const Icon = it.icon;
          return (
            <Link
              key={it.href}
              href={it.href}
              className={cn(
                "flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors",
                active
                  ? "bg-background text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60",
              )}
            >
              <Icon className="size-4" />
              <span className="flex-1">{it.label}</span>
              {typeof it.count === "number" && (
                <Badge
                  variant="outline"
                  className={cn(
                    "font-mono text-[10px] h-4 px-1.5",
                    it.badge === "dot" &&
                      "bg-amber-50 text-amber-700 border-amber-200",
                  )}
                >
                  {it.count}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="p-3 border-t border-border">
        <a
          href={`https://github.com/${projectRepo}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors rounded"
        >
          <GitBranch className="size-3.5" />
          <span className="truncate flex-1 font-mono">{projectRepo}</span>
          <ExternalLink className="size-3" />
        </a>
      </div>
    </aside>
  );
}

function ProjectSwitcher({
  currentId,
  currentName,
  currentRepo,
  currentStatus,
  allProjects,
}: {
  currentId: string;
  currentName: string;
  currentRepo: string;
  currentStatus: string;
  allProjects: { id: string; name: string; githubOwner: string; githubRepo: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left transition-colors",
          "bg-background border border-border hover:border-foreground/20",
        )}
      >
        <div className="size-7 rounded-md bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold shrink-0">
          {currentName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">{currentName}</div>
          <div className="text-[10px] text-muted-foreground font-mono truncate">
            {currentStatus}
          </div>
        </div>
        <ChevronsUpDown className="size-3.5 text-muted-foreground shrink-0" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 mt-1 z-20 bg-background border border-border rounded-md shadow-lg py-1 max-h-80 overflow-y-auto">
          {allProjects.map((p) => {
            const active = p.id === currentId;
            return (
              <button
                key={p.id}
                onClick={() => {
                  router.push(`/projects/${p.id}`);
                  setOpen(false);
                }}
                className={cn(
                  "w-full px-2.5 py-2 flex items-center gap-2 text-left hover:bg-muted transition-colors",
                  active && "bg-muted",
                )}
              >
                <div className="size-6 rounded bg-primary/10 text-primary flex items-center justify-center text-[10px] font-semibold shrink-0">
                  {p.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate">
                    {p.githubOwner}/{p.githubRepo}
                  </div>
                </div>
                {active && <Check className="size-3.5 text-primary shrink-0" />}
              </button>
            );
          })}
          <div className="border-t border-border mt-1 pt-1">
            <Link
              href="/"
              className="block px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              All projects
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

