import { notFound } from "next/navigation";
import { ExternalLink, GitBranch } from "lucide-react";
import { prisma } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { DangerZone } from "../danger-zone";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) notFound();

  return (
    <div className="px-8 py-8 space-y-6 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Réglages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paramètres et actions du projet.
        </p>
      </header>

      <Card className="p-5">
        <h2 className="text-sm font-semibold mb-3">Informations</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Nom</dt>
          <dd className="font-medium">{project.name}</dd>

          <dt className="text-muted-foreground">Statut</dt>
          <dd className="font-mono text-xs">{project.status}</dd>

          <dt className="text-muted-foreground">Repo GitHub</dt>
          <dd>
            <a
              href={`https://github.com/${project.githubOwner}/${project.githubRepo}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary inline-flex items-center gap-1 hover:underline font-mono text-xs"
            >
              <GitBranch className="size-3" />
              {project.githubOwner}/{project.githubRepo}
              <ExternalLink className="size-3" />
            </a>
          </dd>

          <dt className="text-muted-foreground">Branche par défaut</dt>
          <dd className="font-mono text-xs">{project.defaultBranch}</dd>

          {project.figmaUrl && (
            <>
              <dt className="text-muted-foreground">Figma</dt>
              <dd>
                <a
                  href={project.figmaUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex items-center gap-1 hover:underline text-xs"
                >
                  {project.figmaUrl}
                  <ExternalLink className="size-3" />
                </a>
              </dd>
            </>
          )}

          <dt className="text-muted-foreground">Créé le</dt>
          <dd className="text-xs">
            {new Date(project.createdAt).toLocaleDateString("fr-FR", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </dd>
        </dl>
      </Card>

      <DangerZone projectId={id} projectName={project.name} />
    </div>
  );
}
