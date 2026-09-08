/**
 * Мостик между соседними клиентскими компонентами доски: шапка
 * (BoardHeaderActions с диалогом архива) и сам канбан живут рядом в
 * серверной странице и не имеют общего состояния. Вместо прокидывания
 * колбэков через страницу шапка сообщает об изменении задач событием, а
 * канбан по нему сразу перезапрашивает доску.
 */
export const TASKS_CHANGED_EVENT = "pulse:tasks-changed";

export function notifyTasksChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
}
