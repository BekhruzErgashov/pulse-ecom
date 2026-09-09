"use client";

import { CalendarCheck, CalendarClock, Flame, Layers, MessageSquareText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import type { Task, User } from "@/lib/models";
import { PRIORITIES } from "@/lib/schema";
import { isOverdue as checkOverdue } from "@/lib/task-sort";
import { formatWeekLabel, getTaskCompletedWeekKey } from "@/lib/week";
import { cn } from "@/lib/utils";

const PRIORITY_VARIANT: Record<Task["priority"], "outline" | "danger" | "urgent"> = {
  low: "outline",
  medium: "outline",
  high: "danger",
  urgent: "urgent",
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
  assignees,
  onOpen,
  draggable,
  onDragStart,
  onDragEnd,
  boardName,
  showCompletedWeek,
  selected,
  onToggleSelect,
}: {
  task: Task;
  assignees: User[];
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
  /** Карточка отмечена для группового действия. */
  selected?: boolean;
  /** Не передан — режима выделения нет и чекбокс не рисуется. */
  onToggleSelect?: () => void;
}) {
  const priorityLabel = PRIORITIES.find((p) => p.id === task.priority)?.label;
  const isUrgent = task.priority === "urgent";
  const isOverdue = checkOverdue(task);
  const completedWeekKey = showCompletedWeek ? getTaskCompletedWeekKey(task) : null;

  const card = (
    <button
      type="button"
      onClick={onOpen}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "panel card-hover flex w-full cursor-grab flex-col gap-2 p-3 text-left active:cursor-grabbing",
        isUrgent && "border-l-[3px] border-l-[var(--color-urgent)] bg-[var(--color-urgent-soft)]/40",
        selected && "border-[var(--color-signal)] ring-1 ring-[var(--color-signal)]",
      )}
    >
      <div className="flex items-start gap-1.5">
        {isUrgent && <Flame className="mt-0.5 size-3.5 shrink-0 text-[var(--color-urgent)]" />}
        <p className={cn("text-sm font-medium leading-snug", onToggleSelect && "pr-6")}>{task.title}</p>
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
        {assignees.length > 0 && (
          // Аватары внахлёст: несколько исполнителей должны помещаться в
          // карточку, не растягивая её.
          <div className="flex -space-x-1.5">
            {assignees.slice(0, 3).map((a) => (
              <Avatar key={a.email} name={a.name} color={a.color} size="sm" />
            ))}
            {assignees.length > 3 && (
              <span className="flex size-6 items-center justify-center rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] text-[10px] font-medium text-[var(--color-ink-soft)]">
                +{assignees.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </button>
  );

  if (!onToggleSelect) return card;

  // Чекбокс — сосед кнопки, а не её потомок: интерактивный элемент внутри
  // <button> ломает разметку и не ловит клик.
  return (
    <div className="relative">
      {card}
      <label
        className="absolute right-2.5 top-2.5 z-10 flex cursor-pointer items-center"
        title="Выделить задачу"
      >
        <Checkbox
          checked={Boolean(selected)}
          onChange={onToggleSelect}
          aria-label={`Выделить задачу «${task.title}»`}
        />
      </label>
    </div>
  );
}
