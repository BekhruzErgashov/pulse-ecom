"use client";

import { CalendarCheck, CalendarClock, Flame, Layers, MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import type { Task, User } from "@/lib/models";
import { PRIORITIES, TASK_KINDS } from "@/lib/schema";
import { isOverdue as checkOverdue } from "@/lib/task-sort";
import { formatWeekLabel, getTaskCompletedWeekKey } from "@/lib/week";
import { cn } from "@/lib/utils";

const PRIORITY_VARIANT: Record<Task["priority"], "outline" | "danger" | "urgent"> = {
  low: "outline",
  medium: "outline",
  high: "danger",
  urgent: "urgent",
};

const KIND_COLORS: Record<Exclude<Task["kind"], "normal">, { solid: string; soft: string }> = {
  hammers: { solid: "var(--color-stage-progress)", soft: "var(--color-stage-progress-soft)" },
  superhits: { solid: "var(--color-stage-review)", soft: "var(--color-stage-review-soft)" },
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    year: sameYear ? undefined : "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TaskCard({
  task,
  assignee,
  onOpen,
  draggable,
  onDragStart,
  onDragEnd,
  boardName,
  showCompletedWeek,
}: {
  task: Task;
  assignee: User | undefined;
  onOpen: () => void;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  /** Показывается, когда карточка отображается вне контекста своей доски
   *  (например, в сводном виде «Мои задачи со всех досок»). */
  boardName?: string;
  /** Бейдж «завершено на неделе X» — когда в колонке «Готово» смешаны
   *  задачи нескольких недель (фильтр недели = «Все недели»), иначе
   *  недвусмысленно и так — все карточки одной недели. */
  showCompletedWeek?: boolean;
}) {
  const priorityLabel = PRIORITIES.find((p) => p.id === task.priority)?.label;
  const isUrgent = task.priority === "urgent";
  const isPromo = task.kind !== "normal";
  const kindLabel = TASK_KINDS.find((k) => k.id === task.kind)?.label;
  const pct =
    isPromo && task.targetCount ? Math.min(100, Math.round(((task.foundCount ?? 0) / task.targetCount) * 100)) : 0;
  const isOverdue = checkOverdue(task);
  const completedWeekKey = showCompletedWeek ? getTaskCompletedWeekKey(task) : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "panel card-hover flex w-full cursor-grab flex-col gap-2 p-3 text-left active:cursor-grabbing",
        isUrgent && "border-l-[3px] border-l-[var(--color-urgent)] bg-[var(--color-urgent-soft)]/40",
      )}
    >
      <div className="flex items-start gap-1.5">
        {isUrgent && <Flame className="mt-0.5 size-3.5 shrink-0 text-[var(--color-urgent)]" />}
        <p className="text-sm font-medium leading-snug">{task.title}</p>
      </div>

      {boardName && (
        <span className="flex w-fit items-center gap-1 rounded-full bg-[var(--color-paper)] px-2 py-0.5 text-[11px] text-[var(--color-ink-soft)]">
          <Layers className="size-3" />
          {boardName}
        </span>
      )}

      {completedWeekKey && (
        <span className="flex w-fit items-center gap-1 rounded-full bg-[var(--color-stage-done-soft)] px-2 py-0.5 text-[11px] text-[var(--color-stage-done)]">
          <CalendarCheck className="size-3" />
          Готово: {formatWeekLabel(completedWeekKey)}
        </span>
      )}

      {task.description && (
        <p className="line-clamp-2 break-all text-xs text-[var(--color-ink-soft)] [overflow-wrap:anywhere]">
          {task.description}
        </p>
      )}

      {isPromo && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-xs">
            <Badge
              className="border-none px-1.5 py-0"
              style={{
                backgroundColor: KIND_COLORS[task.kind as "hammers" | "superhits"].soft,
                color: KIND_COLORS[task.kind as "hammers" | "superhits"].solid,
              }}
            >
              {kindLabel}
            </Badge>
            <span className="font-mono text-[var(--color-ink-soft)]">
              {task.foundCount ?? 0}
              {task.targetCount != null ? ` / ${task.targetCount}` : ""}
            </span>
          </div>
          {task.targetCount != null && (
            <Progress
              value={pct}
              colorVar={KIND_COLORS[task.kind as "hammers" | "superhits"].solid}
            />
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={PRIORITY_VARIANT[task.priority]}>{priorityLabel}</Badge>
          {task.resultNote && (
            <span title="Есть отчёт о выполнении">
              <MessageSquareText className="size-3.5 text-[var(--color-ink-soft)]" />
            </span>
          )}
          {task.dueDate && (
            <span
              className={cn(
                "flex items-center gap-1 text-xs",
                isOverdue ? "font-medium text-[var(--color-danger)]" : "text-[var(--color-ink-soft)]",
              )}
            >
              <CalendarClock className="size-3" />
              {formatDateTime(task.dueDate)}
            </span>
          )}
        </div>
        {assignee && <Avatar name={assignee.name} color={assignee.color} size="sm" />}
      </div>
    </button>
  );
}
