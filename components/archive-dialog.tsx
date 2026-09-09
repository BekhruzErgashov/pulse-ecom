"use client";

import * as React from "react";
import { toast } from "sonner";
import { ArchiveRestore, Inbox, Loader2, Search, SearchX, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { STAGES } from "@/lib/schema";
import { notifyTasksChanged } from "@/lib/board-events";
import type { Task, User } from "@/lib/models";

/**
 * Архив доски: задачи, убранные из канбана без удаления. Отсюда их можно
 * вернуть обратно или удалить окончательно — по одной или пачкой. Список
 * подгружается при открытии диалога; на самой доске архивные задачи не
 * участвуют.
 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

function stageLabel(stage: Task["stage"]): string {
  return STAGES.find((s) => s.id === stage)?.label ?? stage;
}

export function ArchiveDialog({
  open,
  onOpenChange,
  boardId,
  onRestored,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  /** Задача вернулась на доску — родитель обновляет канбан, не перезагружая страницу. */
  onRestored?: () => void;
}) {
  const [tasks, setTasks] = React.useState<Task[] | null>(null);
  const [users, setUsers] = React.useState<User[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    setSearch("");
    setSelectedIds(new Set());
    fetch(`/api/boards/${boardId}/archive`)
      .then((res) => (res.ok ? res.json() : { tasks: [], allUsers: [] }))
      .then((data) => {
        setTasks(data.tasks ?? []);
        setUsers(data.allUsers ?? []);
      })
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [open, boardId]);

  const nameByEmail = React.useMemo(() => new Map(users.map((u) => [u.email, u.name])), [users]);

  // Ищем по названию, описанию и именам исполнителей — то, по чему обычно
  // и вспоминают задачу, которую убрали месяц назад.
  const visible = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !tasks) return tasks ?? [];
    return tasks.filter((task) => {
      const assignees = task.assigneeEmails.map((e) => nameByEmail.get(e) ?? e).join(" ");
      return `${task.title} ${task.description} ${assignees}`.toLowerCase().includes(q);
    });
  }, [tasks, search, nameByEmail]);

  function toggleSelect(taskId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function drop(ids: string[]) {
    setTasks((prev) => (prev ?? []).filter((t) => !ids.includes(t.id)));
    setSelectedIds(new Set());
  }

  async function handleRestore(task: Task) {
    setPendingId(task.id);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: false }),
      });
      if (!res.ok) {
        toast.error("Не удалось вернуть задачу");
        return;
      }
      drop([task.id]);
      toast.success("Задача вернулась на доску");
      notifyTasksChanged();
      onRestored?.();
    } finally {
      setPendingId(null);
    }
  }

  async function handleDelete(task: Task) {
    setPendingId(task.id);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Не удалось удалить задачу");
        return;
      }
      drop([task.id]);
      toast.success("Задача удалена");
    } finally {
      setPendingId(null);
    }
  }

  function confirmDelete(task: Task) {
    toast(`Удалить задачу «${task.title}»?`, {
      description: "Из архива она исчезнет безвозвратно.",
      action: { label: "Удалить", onClick: () => void handleDelete(task) },
      cancel: { label: "Отмена", onClick: () => {} },
    });
  }

  /** Групповое действие — те же запросы, что и для одной задачи, только пачкой. */
  async function runBulk(
    action: (taskId: string) => Promise<Response>,
    okMessage: (n: number) => string,
    afterOk?: () => void,
  ) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkPending(true);
    try {
      const results = await Promise.all(ids.map((id) => action(id).catch(() => null)));
      const okIds = ids.filter((_, i) => results[i]?.ok);
      drop(okIds);
      if (okIds.length > 0) {
        toast.success(okMessage(okIds.length));
        afterOk?.();
      }
      const failed = ids.length - okIds.length;
      if (failed > 0) toast.error(`Не удалось обработать: ${failed}`);
    } finally {
      setBulkPending(false);
    }
  }

  function bulkRestore() {
    void runBulk(
      (id) =>
        fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: false }),
        }),
      (n) => `Возвращено на доску: ${n}`,
      () => {
        notifyTasksChanged();
        onRestored?.();
      },
    );
  }

  function bulkDelete() {
    toast(`Удалить задач: ${selectedIds.size}?`, {
      description: "Из архива они исчезнут безвозвратно.",
      action: {
        label: "Удалить",
        onClick: () =>
          void runBulk(
            (id) => fetch(`/api/tasks/${id}`, { method: "DELETE" }),
            (n) => `Удалено задач: ${n}`,
          ),
      },
      cancel: { label: "Отмена", onClick: () => {} },
    });
  }

  const allVisibleSelected = visible.length > 0 && visible.every((t) => selectedIds.has(t.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Архив доски</DialogTitle>
          <DialogDescription>
            Задачи, убранные с доски. Их можно вернуть обратно или удалить окончательно.
          </DialogDescription>
        </DialogHeader>

        {(tasks?.length ?? 0) > 0 && (
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-ink-soft)]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск в архиве…"
                className="h-8 pl-8 text-xs"
                aria-label="Поиск по архиву"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0 text-xs"
              onClick={() => {
                const ids = visible.map((t) => t.id);
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  for (const id of ids) {
                    if (allVisibleSelected) next.delete(id);
                    else next.add(id);
                  }
                  return next;
                });
              }}
              disabled={visible.length === 0}
            >
              {allVisibleSelected ? "Снять все" : "Выбрать все"}
            </Button>
          </div>
        )}

        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-(--radius-control) border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-2">
            <span className="text-sm font-medium">Выбрано: {selectedIds.size}</span>
            <div className="ml-auto flex gap-1">
              <Button variant="ghost" size="sm" onClick={bulkRestore} disabled={bulkPending}>
                <ArchiveRestore className="size-3.5" /> Вернуть
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={bulkDelete}
                disabled={bulkPending}
                className="text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
              >
                <Trash2 className="size-3.5" /> Удалить
              </Button>
            </div>
          </div>
        )}

        <div className="max-h-[55vh] space-y-2 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8 text-[var(--color-ink-soft)]">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (tasks?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-[var(--color-ink-soft)]">
              <Inbox className="size-6" />
              Архив пуст. Убрать задачу сюда можно кнопкой «В архив» в самой задаче.
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-[var(--color-ink-soft)]">
              <SearchX className="size-5" />
              Ничего не найдено
            </div>
          ) : (
            visible.map((task) => (
              <div key={task.id} className="panel p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <Checkbox
                      checked={selectedIds.has(task.id)}
                      onChange={() => toggleSelect(task.id)}
                      className="mt-0.5"
                      aria-label={`Выделить задачу «${task.title}»`}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                        {task.assigneeEmails.length > 0
                          ? task.assigneeEmails.map((e) => nameByEmail.get(e) ?? e).join(", ")
                          : "без исполнителя"}
                        {task.archivedAt ? ` · в архиве с ${formatDate(task.archivedAt)}` : ""}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0">
                    {stageLabel(task.stage)}
                  </Badge>
                </div>
                <div className="mt-2 flex justify-end gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRestore(task)}
                    disabled={pendingId === task.id || bulkPending}
                  >
                    <ArchiveRestore className="size-3.5" /> Вернуть
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => confirmDelete(task)}
                    disabled={pendingId === task.id || bulkPending}
                    className="text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                  >
                    <Trash2 className="size-3.5" /> Удалить
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
