import type { Task } from "@/lib/models";

/**
 * Недельное архивирование задач в этапе «Готово» — для длительных командных
 * досок, где список готовых задач иначе растёт бесконечно. Правило: задача
 * в «Готово» видна по умолчанию только в ту неделю, в которую она была
 * завершена (см. `Task.completedAt`); как только неделя закончилась, задача
 * уходит из вида по умолчанию, но остаётся доступной через выбор конкретной
 * недели (см. `collectDoneWeeks` + UI-пикер в колонке «Готово»).
 *
 * Недели считаются по ISO 8601 (понедельник — начало недели, номер недели
 * привязан к первому четвергу года) — так неделя не «переезжает» между
 * годами странным образом и её легко сравнивать как строку "YYYY-Www".
 */

function getIsoWeekAndYear(date: Date): { year: number; week: number } {
  // Работаем в UTC, чтобы не зависеть от локального часового пояса сервера.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7; // Пн=1 ... Вс=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // переносим на четверг этой недели
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return { year: d.getUTCFullYear(), week: weekNo };
}

/** Ключ недели в формате "YYYY-Www", например "2026-W28". */
export function getWeekKey(date: Date): string {
  const { year, week } = getIsoWeekAndYear(date);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function getCurrentWeekKey(): string {
  return getWeekKey(new Date());
}

/** Понедельник 00:00 UTC этой ISO-недели, вычисленный от 4 января (гарантированно попадает в 1-ю неделю года). */
function getIsoWeekMonday(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday;
}

/** Границы недели по ключу: `start` включительно, `end` исключительно (следующий понедельник). */
export function getWeekRange(weekKey: string): { start: Date; end: Date } {
  const match = /^(\d{4})-W(\d{2})$/.exec(weekKey);
  const year = match ? Number(match[1]) : new Date().getUTCFullYear();
  const week = match ? Number(match[2]) : getIsoWeekAndYear(new Date()).week;
  const start = getIsoWeekMonday(year, week);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 7);
  return { start, end };
}

export function isInWeek(iso: string, weekKey: string): boolean {
  const { start, end } = getWeekRange(weekKey);
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
}

const RU_MONTHS_GEN = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/** Человекочитаемая подпись недели, например «7–13 июля 2026». */
export function formatWeekLabel(weekKey: string): string {
  const { start, end } = getWeekRange(weekKey);
  const lastDay = new Date(end);
  lastDay.setUTCDate(end.getUTCDate() - 1);

  const startDay = start.getUTCDate();
  const endDay = lastDay.getUTCDate();
  const year = lastDay.getUTCFullYear();

  if (start.getUTCMonth() === lastDay.getUTCMonth()) {
    return `${startDay}–${endDay} ${RU_MONTHS_GEN[lastDay.getUTCMonth()]} ${year}`;
  }
  return `${startDay} ${RU_MONTHS_GEN[start.getUTCMonth()]} – ${endDay} ${RU_MONTHS_GEN[lastDay.getUTCMonth()]} ${year}`;
}

export function formatWeekLabelShort(weekKey: string): string {
  return weekKey === getCurrentWeekKey() ? `Эта неделя (${formatWeekLabel(weekKey)})` : formatWeekLabel(weekKey);
}

type DoneFilterable = Pick<Task, "stage" | "completedAt" | "updatedAt">;

/** Особое значение недели — «без фильтра», показывает готовые задачи всех недель сразу. */
export const ALL_WEEKS = "all";

/**
 * Оставляет задачи «не готово» как есть; задачи «Готово» — только если
 * завершены в указанную неделю (либо все, если `weekKey === ALL_WEEKS`,
 * см. UX «Закрытые задачи» — там по умолчанию нужен весь архив, а не
 * только текущая неделя). Для задач без `completedAt` (созданы до
 * появления этого поля и ни разу не обновлялись) используется `updatedAt`
 * как приближение — иначе старые готовые задачи пропали бы молча.
 */
export function filterDoneTasksByWeek<T extends DoneFilterable>(tasks: T[], weekKey: string): T[] {
  if (weekKey === ALL_WEEKS) return tasks;
  return tasks.filter((t) => {
    if (t.stage !== "done") return true;
    const completedAt = t.completedAt ?? t.updatedAt;
    return isInWeek(completedAt, weekKey);
  });
}

/** Неделя, в которую конкретная задача попала в «Готово» — null, если она сейчас не в этом этапе. Для бейджа на карточке. */
export function getTaskCompletedWeekKey<T extends DoneFilterable>(task: T): string | null {
  if (task.stage !== "done") return null;
  const completedAt = task.completedAt ?? task.updatedAt;
  return getWeekKey(new Date(completedAt));
}

/** Список недель, в которые были завершены задачи — для UI-пикера, новые сверху. */
export function collectDoneWeeks<T extends DoneFilterable>(tasks: T[]): { weekKey: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    if (t.stage !== "done") continue;
    const completedAt = t.completedAt ?? t.updatedAt;
    const key = getWeekKey(new Date(completedAt));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([weekKey, count]) => ({ weekKey, count }))
    .sort((a, b) => (a.weekKey < b.weekKey ? 1 : -1));
}
