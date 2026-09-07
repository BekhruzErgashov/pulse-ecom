import type { Task } from "@/lib/models";

const PRIORITY_WEIGHT: Record<Task["priority"], number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Порядок в колонках канбана:
 * 1. Горящие задачи — всегда первыми, независимо от срока.
 * 2. Дальше — по сроку сдачи (раньше срок — выше), без срока — в конец.
 * 3. При одинаковом сроке — по приоритету (высокий выше низкого).
 * 4. Стабильный хвост — по дате создания.
 */
export function compareTasks(a: Task, b: Task): number {
  const aUrgent = a.priority === "urgent" ? 0 : 1;
  const bUrgent = b.priority === "urgent" ? 0 : 1;
  if (aUrgent !== bUrgent) return aUrgent - bUrgent;

  const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
  const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
  if (aDue !== bDue) return aDue - bDue;

  const aWeight = PRIORITY_WEIGHT[a.priority] ?? 3;
  const bWeight = PRIORITY_WEIGHT[b.priority] ?? 3;
  if (aWeight !== bWeight) return aWeight - bWeight;

  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}

export function isSameLocalDay(iso: string, reference: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === reference.getFullYear() &&
    d.getMonth() === reference.getMonth() &&
    d.getDate() === reference.getDate()
  );
}

export function isOverdue(task: Task, now: Date = new Date()): boolean {
  return Boolean(task.dueDate) && task.stage !== "done" && new Date(task.dueDate!).getTime() < now.getTime();
}

export function isDueToday(task: Task, now: Date = new Date()): boolean {
  return Boolean(task.dueDate) && task.stage !== "done" && isSameLocalDay(task.dueDate!, now) && !isOverdue(task, now);
}
