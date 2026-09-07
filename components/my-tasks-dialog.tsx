"use client";

import * as React from "react";
import Link from "next/link";
import { Flame, Inbox, LayoutGrid, Layers, Loader2 } from "lucide-react";
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
import { PRIORITIES, STAGES } from "@/lib/schema";
import { isOverdue as checkOverdue, compareTasks } from "@/lib/task-sort";
import type { TaskWithBoard } from "@/lib/models";

const PRIORITY_VARIANT: Record<string, "outline" | "danger" | "urgent"> = {
  low: "outline",
  medium: "outline",
  high: "danger",
  urgent: "urgent",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

export function MyTasksDialog({
  open,
  onOpenChange,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}) {
  const [tasks, setTasks] = React.useState<TaskWithBoard[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/tasks/mine?workspaceId=${workspaceId}`)
      .then((res) => (res.ok ? res.json() : { tasks: [] }))
      .then((data) => setTasks(data.tasks))
      .finally(() => setLoading(false));
  }, [open, workspaceId]);

  const sorted = tasks ? [...tasks].sort(compareTasks) : [];
  const active = sorted.filter((t) => t.stage !== "done");
  const done = sorted.filter((t) => t.stage === "done");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Мои задачи</DialogTitle>
          <DialogDescription>Всё, что назначено на вас, по всем доскам пространства.</DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="size-5 animate-spin text-[var(--color-ink-soft)]" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Inbox className="size-5 text-[var(--color-ink-soft)]" />
              <p className="text-sm text-[var(--color-ink-soft)]">На вас пока ничего не назначено.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {active.length > 0 && (
                <div className="flex flex-col gap-1">
                  {active.map((task) => (
                    <TaskRow key={task.id} task={task} workspaceId={workspaceId} onNavigate={() => onOpenChange(false)} />
                  ))}
                </div>
              )}
              {done.length > 0 && (
                <div>
                  <p className="eyebrow mb-1 px-1">Готово</p>
                  <div className="flex flex-col gap-1">
                    {done.map((task) => (
                      <TaskRow key={task.id} task={task} workspaceId={workspaceId} onNavigate={() => onOpenChange(false)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="sm:justify-start">
          <Button asChild variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            <Link href={`/w/${workspaceId}/my-tasks`}>
              <LayoutGrid className="size-3.5" /> Общая доска со всеми моими задачами
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskRow({
  task,
  workspaceId,
  onNavigate,
}: {
  task: TaskWithBoard;
  workspaceId: string;
  onNavigate: () => void;
}) {
  const priorityLabel = PRIORITIES.find((p) => p.id === task.priority)?.label;
  const stageLabel = STAGES.find((s) => s.id === task.stage)?.label;
  const overdue = checkOverdue(task);

  return (
    <Link
      href={`/w/${workspaceId}/my-tasks?taskId=${task.id}`}
      onClick={onNavigate}
      className="flex items-start justify-between gap-3 rounded-(--radius-control) px-2 py-2 hover:bg-[var(--color-paper)]"
    >
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium leading-snug">
          {task.priority === "urgent" && (
            <Flame className="size-3.5 shrink-0 text-[var(--color-urgent)]" />
          )}
          <span className="truncate">{task.title}</span>
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 rounded-full bg-[var(--color-paper)] px-2 py-0.5 text-xs text-[var(--color-ink-soft)]">
            <Layers className="size-3" />
            {task.boardName}
          </span>
          <Badge variant={PRIORITY_VARIANT[task.priority]}>{priorityLabel}</Badge>
          <Badge variant="outline">{stageLabel}</Badge>
        </div>
      </div>
      {task.dueDate && (
        <span
          className={`shrink-0 whitespace-nowrap text-xs ${overdue ? "font-medium text-[var(--color-danger)]" : "text-[var(--color-ink-soft)]"}`}
        >
          {formatDate(task.dueDate)}
        </span>
      )}
    </Link>
  );
}
