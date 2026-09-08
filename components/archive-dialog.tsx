"use client";

import * as React from "react";
import { toast } from "sonner";
import { ArchiveRestore, Inbox, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
 * вернуть обратно или удалить окончательно. Список подгружается при
 * открытии диалога — на самой доске архивные задачи не участвуют.
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

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/boards/${boardId}/archive`)
      .then((res) => (res.ok ? res.json() : { tasks: [], allUsers: [] }))
      .then((data) => {
        setTasks(data.tasks ?? []);
        setUsers(data.allUsers ?? []);
      })
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [open, boardId]);

  const nameByEmail = React.useMemo(
    () => new Map(users.map((u) => [u.email, u.name])),
    [users],
  );

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
      setTasks((prev) => (prev ?? []).filter((t) => t.id !== task.id));
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
      setTasks((prev) => (prev ?? []).filter((t) => t.id !== task.id));
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Архив доски</DialogTitle>
          <DialogDescription>
            Задачи, убранные с доски. Их можно вернуть обратно или удалить окончательно.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8 text-[var(--color-ink-soft)]">
              <Loader2 className="size-5 animate-spin" />
            </div>
          ) : (tasks?.length ?? 0) === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-[var(--color-ink-soft)]">
              <Inbox className="size-6" />
              Архив пуст. Убрать задачу сюда можно кнопкой «В архив» в самой задаче.
            </div>
          ) : (
            tasks!.map((task) => (
              <div key={task.id} className="panel p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{task.title}</p>
                    <p className="mt-1 text-xs text-[var(--color-ink-soft)]">
                      {task.assigneeEmail
                        ? (nameByEmail.get(task.assigneeEmail) ?? task.assigneeEmail)
                        : "без исполнителя"}
                      {task.archivedAt ? ` · в архиве с ${formatDate(task.archivedAt)}` : ""}
                    </p>
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
                    disabled={pendingId === task.id}
                  >
                    <ArchiveRestore className="size-3.5" /> Вернуть
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => confirmDelete(task)}
                    disabled={pendingId === task.id}
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
