import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { orchestratorQueue } from "@/lib/queue";

async function createProject(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "").trim();
  const brief = String(formData.get("brief") ?? "").trim();
  const repo = String(formData.get("repo") ?? "").trim(); // "owner/repo"
  const installationId = String(formData.get("installationId") ?? "").trim();
  const figmaUrl = String(formData.get("figmaUrl") ?? "").trim();

  if (!name || !brief || !repo.includes("/")) {
    throw new Error("Missing fields");
  }

  const [owner, r] = repo.split("/");
  const project = await prisma.project.create({
    data: {
      name,
      brief,
      githubOwner: owner,
      githubRepo: r,
      installationId: installationId ? BigInt(installationId) : null,
      figmaUrl: figmaUrl || null,
      status: "INTAKE",
    },
  });

  await orchestratorQueue.add("gate-event", {
    projectId: project.id,
    event: "INTAKE",
  });

  redirect(`/projects/${project.id}`);
}

export default function NewProjectPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">New project</h1>
      <form action={createProject} className="space-y-4">
        <label className="block">
          <span className="text-sm text-muted">Name</span>
          <input
            name="name"
            required
            className="mt-1 w-full bg-panel border border-border rounded-md px-3 py-2"
            placeholder="Acme mobile app"
          />
        </label>

        <label className="block">
          <span className="text-sm text-muted">GitHub repo (owner/name)</span>
          <input
            name="repo"
            required
            className="mt-1 w-full bg-panel border border-border rounded-md px-3 py-2 font-mono text-sm"
            placeholder="les-ignobles/acme-app"
          />
        </label>

        <label className="block">
          <span className="text-sm text-muted">
            GitHub App installation id (optional — leave empty to use PAT fallback)
          </span>
          <input
            name="installationId"
            className="mt-1 w-full bg-panel border border-border rounded-md px-3 py-2 font-mono text-sm"
            placeholder="12345678"
          />
        </label>

        <label className="block">
          <span className="text-sm text-muted">
            Figma file URL (optional — unlocks the Figma MCP for PM + Devs)
          </span>
          <input
            name="figmaUrl"
            className="mt-1 w-full bg-panel border border-border rounded-md px-3 py-2 font-mono text-sm"
            placeholder="https://www.figma.com/file/..."
          />
        </label>

        <label className="block">
          <span className="text-sm text-muted">Client brief</span>
          <textarea
            name="brief"
            required
            rows={10}
            className="mt-1 w-full bg-panel border border-border rounded-md px-3 py-2 text-sm"
            placeholder="Describe what you want to build. Users, goals, constraints. The PM agent takes it from here."
          />
        </label>

        <button
          type="submit"
          className="bg-accent text-white text-sm px-4 py-2 rounded-md hover:opacity-90"
        >
          Start project
        </button>
      </form>
    </div>
  );
}
