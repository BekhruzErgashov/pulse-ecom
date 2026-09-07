"use client";

import * as React from "react";
import { toast } from "sonner";
import { Clock, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Avatar } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AllowedEmail, User, Workspace } from "@/lib/models";

export function WorkspaceMembersDialog({
  open,
  onOpenChange,
  workspace,
  allUsers,
  allowedEmails,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
  allUsers: User[];
  allowedEmails: AllowedEmail[];
}) {
  const [memberEmails, setMemberEmails] = React.useState<string[]>([]);
  const [pendingEmails, setPendingEmails] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedToAdd, setSelectedToAdd] = React.useState("");
  const [inviting, setInviting] = React.useState(false);

  const usersByEmail = new Map(allUsers.map((u) => [u.email, u]));

  const loadMembers = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/workspaces/${workspace.id}/members`);
      if (res.ok) {
        const data = await res.json();
        setMemberEmails(data.emails);
        setPendingEmails(data.pending ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [workspace.id]);

  React.useEffect(() => {
    if (open) {
      setSelectedToAdd("");
      loadMembers();
    }
  }, [open, loadMembers]);

  const candidates = allowedEmails
    .map((a) => a.email)
    .filter((email) => !memberEmails.includes(email) && !pendingEmails.includes(email));

  async function handleInvite() {
    if (!selectedToAdd) return;
    setInviting(true);
    try {
      const res = await fetch(`/api/admin/workspaces/${workspace.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: selectedToAdd }),
      });
      if (!res.ok) {
        toast.error("Не удалось выдать доступ");
        return;
      }
      const data = await res.json();
      if (data.status === "added") {
        setMemberEmails((prev) => [...prev, selectedToAdd]);
        toast.success("Доступ к пространству выдан");
      } else {
        setPendingEmails((prev) => [...prev, selectedToAdd]);
        toast.success("Приглашение сохранено — доступ появится сразу после регистрации");
      }
      setSelectedToAdd("");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemoveMember(email: string) {
    const previous = memberEmails;
    setMemberEmails((prev) => prev.filter((e) => e !== email));
    const res = await fetch(
      `/api/admin/workspaces/${workspace.id}/members/${encodeURIComponent(email)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      setMemberEmails(previous);
      toast.error("Не удалось убрать участника");
      return;
    }
    toast.success("Доступ отозван");
  }

  async function handleCancelInvite(email: string) {
    const previous = pendingEmails;
    setPendingEmails((prev) => prev.filter((e) => e !== email));
    const res = await fetch(
      `/api/admin/workspaces/${workspace.id}/invites/${encodeURIComponent(email)}`,
      { method: "DELETE" },
    );
    if (!res.ok) {
      setPendingEmails(previous);
      toast.error("Не удалось отменить приглашение");
      return;
    }
    toast.success("Приглашение отменено");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Участники «{workspace.name}»</DialogTitle>
          <DialogDescription>
            Выбирайте из разрешённых email — если человек ещё не
            зарегистрирован, доступ появится сразу после регистрации.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <Select value={selectedToAdd} onChange={(e) => setSelectedToAdd(e.target.value)}>
              <option value="">Выберите email...</option>
              {candidates.map((email) => {
                const u = usersByEmail.get(email);
                return (
                  <option key={email} value={email}>
                    {u ? `${u.name} (${email})` : `${email} — не зарегистрирован`}
                  </option>
                );
              })}
            </Select>
            <Button type="button" onClick={handleInvite} disabled={!selectedToAdd || inviting}>
              {inviting ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            </Button>
          </div>

          {loading ? (
            <p className="text-sm text-[var(--color-ink-soft)]">Загрузка...</p>
          ) : (
            <>
              {memberEmails.length === 0 && pendingEmails.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-soft)]">Пока никого нет.</p>
              ) : (
                <div className="panel divide-y divide-[var(--color-line)]">
                  {memberEmails.map((email) => {
                    const u = usersByEmail.get(email);
                    return (
                      <div key={email} className="flex items-center justify-between gap-3 px-3 py-2">
                        <div className="flex items-center gap-2.5">
                          <Avatar name={u?.name ?? email} color={u?.color} size="sm" />
                          <div>
                            <p className="text-sm font-medium">{u?.name ?? email}</p>
                            <p className="text-xs text-[var(--color-ink-soft)]">{email}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveMember(email)}
                          className="rounded-(--radius-control) p-1 text-[var(--color-ink-soft)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                          aria-label="Убрать из пространства"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  {pendingEmails.map((email) => (
                    <div key={email} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <div className="flex size-6 items-center justify-center rounded-full bg-[var(--color-paper)] text-[var(--color-ink-soft)]">
                          <Clock className="size-3.5" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{email}</p>
                          <p className="text-xs text-[var(--color-ink-soft)]">
                            Ждёт регистрации — доступ появится автоматически
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCancelInvite(email)}
                        className="rounded-(--radius-control) p-1 text-[var(--color-ink-soft)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)]"
                        aria-label="Отменить приглашение"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
