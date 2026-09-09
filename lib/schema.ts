/**
 * Доменная схема Team Task Tracker.
 *
 * Персистентность: см. lib/data.ts. Если задан DATABASE_URL — данные
 * хранятся в Postgres (lib/store-db.ts, DDL в lib/schema.sql.ts).
 * Иначе используется in-memory реализация (lib/store-memory.ts),
 * которая сбрасывается при перезапуске сервера.
 */

export const STAGES = [
  { id: "todo", label: "К выполнению" },
  { id: "in_progress", label: "В работе" },
  { id: "review", label: "На проверке" },
  { id: "done", label: "Готово" },
] as const;

export type StageId = (typeof STAGES)[number]["id"];

export const PRIORITIES = [
  { id: "low", label: "Низкий" },
  { id: "medium", label: "Средний" },
  { id: "high", label: "Высокий" },
  { id: "urgent", label: "Горящая" },
] as const;

export type PriorityId = (typeof PRIORITIES)[number]["id"];
