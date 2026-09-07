"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Loader2, Plus, ShieldCheck, ShieldOff, Trash2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WorkspacesSection } from "@/components/workspaces-section";
import { AdminBroadcast } from "@/components/admin-broadcast";
import { addAllowedEmailSchema } from "@/lib/validation";
import type { AllowedEmail, User, Workspace } from "@/lib/models";

export function AdminPanel({
  currentUserEmail,
  initialAllowedEmails,
  initialUsers,
  initialWorkspaces,
}: {
  currentUserEmail: string;
  initialAllowedEmails: AllowedEmail[];
  initialUsers: User[];
  initialWorkspaces: Workspace[];
}) {
  const [allowedEmails, setAllowedEmails] = React.useState(initialAllowedEmails);
  const [users, setUsers] = React.useState(initialUsers);
  const [newEmail, setNewEmail] = React.useState("");
  const [addPending, setAddPending] = React.useState(false);
  const [resetTarget, setResetTarget] = React.useState<User | null>(null);
  const [resetPassword, setResetPassword] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const registeredEmails = new Set(users.map((u) => u.email));

  async function handleAddEmail(e: React.FormEvent) {
    e.preventDefault();
    const parsed = addAllowedEmailSchema.safeParse({ email: newEmail });
    if (!parsed.success) {
      toast.error(parsed.error.flatten().fieldErrors.email?.[0] ?? "Некорректный email");
      return;
    }
    setAddPending(true);
    try {
      const res = await fetch("/api/admin/allowed-emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Не удалось добавить email");
        return;
      }
      const data = await res.json();
      setAllowedEmails((prev) => [data.entry, ...prev.filter((e) => e.email !== data.entry.email)]);
      setNewEmail("");
      toast.success("Доступ выдан — теперь этот email может зарегистрироваться");
    } finally {
      setAddPending(false);
    }
  }

  async function handleRemoveEmail(email: string) {
    const previous = allowedEmails;
    setAllowedEmails((prev) => prev.filter((e) => e.email !== email));
    const res = await fetch(`/api/admin/allowed-emails/${encodeURIComponent(email)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      setAllowedEmails(previous);
      toast.error("Не удалось убрать email");
      return;
    }
    toast.success("Доступ отозван");
  }

  async function handleToggleRole(user: User) {
    const nextRole = user.role === "admin" ? "member" : "admin";
    const previous = users;
    setUsers((prev) => prev.map((u) => (u.email === user.email ? { ...u, role: nextRole } : u)));
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.email)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: nextRole }),
    });
    if (!res.ok) {
      setUsers(previous);
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "Не удалось изменить роль");
      return;
    }
    toast.success(nextRole === "admin" ? "Назначен администратором" : "Роль изменена на участника");
  }

  async function handleToggleActive(user: User) {
    const nextActive = !user.isActive;
    const previous = users;
    setUsers((prev) => prev.map((u) => (u.email === user.email ? { ...u, isActive: nextActive } : u)));
    const res = await fetch(`/api/admin/users/${encodeURIComponent(user.email)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: nextActive }),
    });
    if (!res.ok) {
      setUsers(previous);
      const data = await res.json().catch(() => null);
      toast.error(data?.error ?? "Не удалось изменить доступ");
      return;
    }
    toast.success(nextActive ? "Доступ восстановлен" : "Доступ заблокирован");
  }

  function confirmDeleteUser(user: User) {
    toast(`Удалить аккаунт «${user.name}»?`, {
      description: "Это действие необратимо. Если у пользователя есть свои пространства или доски, сначала передайте владение.",
      action: {
        label: "Удалить",
        onClick: async () => {
          const res = await fetch(`/api/admin/users/${encodeURIComponent(user.email)}`, {
            method: "DELETE",
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            toast.error(data?.error ?? "Не удалось удалить аккаунт");
            return;
          }
          setUsers((prev) => prev.filter((u) => u.email !== user.email));
          toast.success("Аккаунт удалён");
        },
      },
      cancel: { label: "Отмена", onClick: () => {} },
    });
  }

  async function handleResetPassword() {
    if (!resetTarget) return;
    const res = await fetch(`/api/admin/users/${encodeURIComponent(resetTarget.email)}/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      toast.error("Не удалось сбросить пароль");
      return;
    }
    const data = await res.json();
    setResetPassword(data.password);
  }

  function handleCopyPassword() {
    if (!resetPassword) return;
    navigator.clipboard.writeText(resetPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex flex-col gap-10">
      <WorkspacesSection
        initialWorkspaces={initialWorkspaces}
        allUsers={users}
        allowedEmails={allowedEmails}
      />

      <AdminBroadcast workspaces={initialWorkspaces} />

      <section>
        <h2 className="mb-1 text-base font-semibold">Разрешённые email</h2>
        <p className="mb-4 text-sm text-[var(--color-ink-soft)]">
          Зарегистрироваться сможет только тот, чей email есть в этом списке.
          После регистрации не забудьте добавить человека в нужное пространство выше.
        </p>
        <form onSubmit={handleAddEmail} className="mb-4 flex gap-2">
          <Input
            type="email"
            placeholder="new.person@team.dev"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
          />
          <Button type="submit" disabled={addPending}>
            {addPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            Выдать доступ
          </Button>
        </form>
        {allowedEmails.length === 0 ? (
          <p className="text-sm text-[var(--color-ink-soft)]">Список пуст.</p>
        ) : (
          <div className="panel divide-y divide-[var(--color-line)]">
            {allowedEmails.map((entry) => (
              <div key={entry.email} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{entry.email}</p>
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    {registeredEmails.has(entry.email) ? "Уже зарегистрирован" : "Ещё не регистрировался"}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveEmail(entry.email)}
                  className="text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                >
                  <Trash2 className="size-3.5" /> Отозвать
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-base font-semibold">Участники</h2>
        <p className="mb-4 text-sm text-[var(--color-ink-soft)]">
          Назначайте администраторов, блокируйте доступ и сбрасывайте пароли.
        </p>
        <div className="panel divide-y divide-[var(--color-line)]">
          {users.map((user) => (
            <div key={user.email} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3">
                <Avatar name={user.name} color={user.color} size="sm" />
                <div>
                  <p className="text-sm font-medium">
                    {user.name}
                    {user.email === currentUserEmail && (
                      <span className="ml-1.5 text-xs text-[var(--color-ink-soft)]">(вы)</span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--color-ink-soft)]">{user.email}</p>
                </div>
                <Badge variant={user.role === "admin" ? "default" : "outline"}>
                  {user.role === "admin" ? "Админ" : "Участник"}
                </Badge>
                {!user.isActive && <Badge variant="danger">Заблокирован</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setResetTarget(user);
                    setResetPassword(null);
                  }}
                >
                  <KeyRound className="size-3.5" /> Сбросить пароль
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleRole(user)}
                  disabled={user.email === currentUserEmail}
                  title={
                    user.email === currentUserEmail
                      ? "Нельзя изменить собственную роль"
                      : undefined
                  }
                >
                  <UserCog className="size-3.5" />
                  {user.role === "admin" ? "Сделать участником" : "Сделать админом"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleActive(user)}
                  disabled={user.email === currentUserEmail}
                  className={
                    user.isActive
                      ? "text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                      : undefined
                  }
                  title={
                    user.email === currentUserEmail ? "Нельзя заблокировать себя" : undefined
                  }
                >
                  {user.isActive ? (
                    <>
                      <ShieldOff className="size-3.5" /> Заблокировать
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="size-3.5" /> Разблокировать
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => confirmDeleteUser(user)}
                  disabled={user.email === currentUserEmail}
                  className="text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                  title={user.email === currentUserEmail ? "Нельзя удалить себя" : undefined}
                >
                  <Trash2 className="size-3.5" /> Удалить аккаунт
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Dialog open={Boolean(resetTarget)} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Сбросить пароль</DialogTitle>
            <DialogDescription>
              {resetTarget && `Для ${resetTarget.name} (${resetTarget.email})`}
            </DialogDescription>
          </DialogHeader>
          {resetPassword ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-[var(--color-ink-soft)]">
                Новый пароль сгенерирован. Передайте его человеку — он больше нигде не
                сохранён и не будет показан повторно.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-(--radius-control) border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2 font-mono text-sm">
                  {resetPassword}
                </code>
                <Button type="button" variant="outline" size="icon" onClick={handleCopyPassword}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
              </div>
              <DialogFooter>
                <Button type="button" onClick={() => setResetTarget(null)}>
                  Готово
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>
                Отмена
              </Button>
              <Button type="button" onClick={handleResetPassword}>
                Сгенерировать новый пароль
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
