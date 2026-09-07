"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { Workspace } from "@/lib/models";

export function AdminBroadcast({ workspaces }: { workspaces: Workspace[] }) {
  const [workspaceId, setWorkspaceId] = React.useState(workspaces[0]?.id ?? "");
  const [message, setMessage] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) {
      toast.error("Выберите пространство");
      return;
    }
    if (!message.trim()) {
      toast.error("Введите текст сообщения");
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/admin/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId, message }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Не удалось отправить объявление");
        return;
      }
      const data = await res.json();
      toast.success(`Отправлено ${data.sent} участникам`);
      setMessage("");
    } finally {
      setPending(false);
    }
  }

  return (
    <section>
      <h2 className="mb-1 text-base font-semibold">Объявление</h2>
      <p className="mb-4 text-sm text-[var(--color-ink-soft)]">
        Сообщение придёт всем участникам пространства — в колокольчик внутри приложения и
        в Telegram, если бот привязан.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="broadcast-workspace">Пространство</Label>
          <select
            id="broadcast-workspace"
            value={workspaceId}
            onChange={(e) => setWorkspaceId(e.target.value)}
            disabled={workspaces.length === 0}
            className="h-9 w-full rounded-(--radius-control) border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-3 text-sm text-[var(--color-ink)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-signal)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {workspaces.length === 0 && <option value="">Нет пространств</option>}
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="broadcast-message">Текст объявления</Label>
          <textarea
            id="broadcast-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Например: завтра в 11:00 общая встреча команды"
            className="w-full rounded-(--radius-control) border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-3 py-2 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-signal)]"
          />
        </div>
        <Button type="submit" disabled={pending || workspaces.length === 0} className="self-start">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Megaphone className="size-4" />}
          Отправить
        </Button>
      </form>
    </section>
  );
}
