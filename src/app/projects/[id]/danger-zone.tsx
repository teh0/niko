"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Destructive settings card at the bottom of the overview. Requires
 * typing the project name verbatim before the Delete button activates
 * — small speed bump, big intent-check.
 */
export function DangerZone({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const canDelete = confirm === projectName && !deleting;

  async function remove() {
    if (!canDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) {
        alert("Échec de la suppression : " + (await res.text()));
        return;
      }
      router.push("/");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Card className="p-5 border-red-200 bg-red-50/30">
      <div className="flex items-center gap-2 text-red-700 mb-1">
        <Trash2 className="size-4" />
        <h2 className="text-sm font-semibold">Zone dangereuse</h2>
      </div>
      <p className="text-xs text-red-700/80 mb-4">
        Supprime le projet et tout ce qui est associé (gates, tickets, runs,
        conversations). Le workspace local est nettoyé. Le repo GitHub
        reste intact — à toi de le gérer à la main si tu veux le supprimer
        aussi.
      </p>
      <div className="text-xs text-muted-foreground mb-2">
        Pour confirmer, tape le nom du projet :{" "}
        <code className="font-mono text-xs bg-background border border-border px-1 rounded">
          {projectName}
        </code>
      </div>
      <div className="flex gap-2 items-center">
        <Input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Nom du projet"
          className="text-xs max-w-sm"
          disabled={deleting}
        />
        <Button
          variant="destructive"
          onClick={remove}
          disabled={!canDelete}
          size="sm"
        >
          {deleting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
          {deleting ? "Suppression…" : "Supprimer définitivement"}
        </Button>
      </div>
    </Card>
  );
}
