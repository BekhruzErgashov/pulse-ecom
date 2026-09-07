"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createWorkspaceSchema } from "@/lib/validation";
import { WorkspaceMembersDialog } from "@/components/workspace-members-dialog";
import type { AllowedEmail, User, Workspace } from "@/lib/models";

export function WorkspacesSection({
  initialWorkspaces,
  allUsers,
  allowedEmails,
}: {
  initialWorkspaces: Workspace[];
  allUsers: User[];
  allowedEmails: AllowedEmail[];
}) {
  const [workspaces, setWorkspaces] = React.useState(initialWorkspaces);
  const [name, setName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [managingWorkspace, setManagingWorkspace] = React.useState<Workspace | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createWorkspaceSchema.safeParse({ name });
    if (!parsed.success) {
      toast.error(parsed.error.flatten().fieldErrors.name?.[0] ?? "Некорректное название");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Не удалось создать пространство");
        return;
      }
      const data = await res.json();
      setWorkspaces((prev) => [...prev, data.workspace]);
      setName("");
      toast.success("Пространство создано");
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <h2 className="mb-1 text-base font-semibold">Пространства</h2>
      <p className="mb-4 text-sm text-[var(--color-ink-soft)]">
        Каждое пространство — отдельная команда со своими досками. Люди видят
        только те пространства, куда их добавили.
      </p>
      <form onSubmit={handleCreate} className="mb-4 flex gap-2">
        <Input
          placeholder="Например, «Команда маркетинга»"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
          Создать
        </Button>
      </form>

      {workspaces.length === 0 ? (
        <p className="text-sm text-[var(--color-ink-soft)]">Пространств пока нет.</p>
      ) : (
        <div className="panel divide-y divide-[var(--color-line)]">
          {workspaces.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <p className="text-sm font-medium">{w.name}</p>
              <Button variant="outline" size="sm" onClick={() => setManagingWorkspace(w)}>
                <Users className="size-3.5" /> Участники
              </Button>
            </div>
          ))}
        </div>
      )}

      {managingWorkspace && (
        <WorkspaceMembersDialog
          open={Boolean(managingWorkspace)}
          onOpenChange={(open) => !open && setManagingWorkspace(null)}
          workspace={managingWorkspace}
          allUsers={allUsers}
          allowedEmails={allowedEmails}
        />
      )}
    </section>
  );
}
