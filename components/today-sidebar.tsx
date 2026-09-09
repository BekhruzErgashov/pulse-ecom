"use client";

import { AlertTriangle, CalendarClock, Flame } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { Task, User } from "@/lib/models";
import { isDueToday, isOverdue } from "@/lib/task-sort";
import { cn } from "@/lib/utils";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function TaskRow({
  task,
  assignees,
  onOpen,
  danger,
}: {
  task: Task;
  assignees: User[];
  onOpen: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-2 rounded-(--radius-control) px-2 py-1.5 text-left hover:bg-[var(--color-paper)]"
    >
      {task.priority === "urgent" && (
        <Flame className="size-3.5 shrink-0 text-[var(--color-urgent)]" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">{task.title}</p>
        {task.dueDate && (
          <p
            className={cn(
              "text-xs",
              danger ? "text-[var(--color-danger)]" : "text-[var(--color-ink-soft)]",
            )}
          >
            {formatTime(task.dueDate)}
          </p>
        )}
      </div>
      {assignees.length > 0 && (
        <div className="flex -space-x-1.5">
          {assignees.slice(0, 3).map((a) => (
            <Avatar key={a.email} name={a.name} color={a.color} size="sm" />
          ))}
        </div>
      )}
    </button>
  );
}

export function TodaySidebar({
  tasks,
  usersByEmail,
  onOpen,
}: {
  tasks: Task[];
  usersByEmail: Map<string, User>;
  onOpen: (task: Task) => void;
}) {
  const now = new Date();
  const overdue = tasks.filter((t) => isOverdue(t, now));
  const today = tasks.filter((t) => isDueToday(t, now));

  if (overdue.length === 0 && today.length === 0) {
    return (
      <div className="panel p-4">
        <p className="eyebrow mb-3">На сегодня</p>
        <p className="text-sm text-[var(--color-ink-soft)]">
          Нет задач со сроком сегодня или просроченных — можно выдохнуть.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {overdue.length > 0 && (
        <div className="panel p-3">
          <div className="mb-2 flex items-center gap-1.5 px-1">
            <AlertTriangle className="size-3.5 text-[var(--color-danger)]" />
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-danger)]">
              Просрочено
            </p>
            <span className="ml-auto font-mono text-xs text-[var(--color-ink-soft)]">
              {overdue.length}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            {overdue.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                assignees={t.assigneeEmails.map((e) => usersByEmail.get(e)).filter((u): u is User => Boolean(u))}
                onOpen={() => onOpen(t)}
                danger
              />
            ))}
          </div>
        </div>
      )}

      <div className="panel p-3">
        <div className="mb-2 flex items-center gap-1.5 px-1">
          <CalendarClock className="size-3.5 text-[var(--color-ink-soft)]" />
          <p className="eyebrow">Сегодня</p>
          <span className="ml-auto font-mono text-xs text-[var(--color-ink-soft)]">
            {today.length}
          </span>
        </div>
        {today.length === 0 ? (
          <p className="px-1 text-sm text-[var(--color-ink-soft)]">Нет задач со сроком сегодня.</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {today.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                assignees={t.assigneeEmails.map((e) => usersByEmail.get(e)).filter((u): u is User => Boolean(u))}
                onOpen={() => onOpen(t)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
