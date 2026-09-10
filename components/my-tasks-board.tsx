"use client";

import * as React from "react";
import { useDarkGlass } from "@/lib/use-dark-glass";
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Inbox,
  Search,
  SearchX,
} from "lucide-react";
import { StageRail } from "@/components/stage-rail";
import { StatusFilterDropdown, type StatusFilterValue } from "@/components/status-filter-dropdown";
import { TaskCard } from "@/components/task-card";
import { TaskDialog } from "@/components/task-dialog";
import { TodaySidebar } from "@/components/today-sidebar";
import { WeekPicker } from "@/components/week-picker";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { StageId } from "@/lib/schema";
import { compareTasks, isDueToday, isOverdue } from "@/lib/task-sort";
import { ALL_WEEKS, getCurrentWeekKey } from "@/lib/week";
import type { Task, TaskWithBoard, User } from "@/lib/models";
import { cn } from "@/lib/utils";


/**
 * Сводная доска «Мои задачи» — то же самое дерево задач, что и на
 * отдельных досках, просто отфильтрованное по исполнителю и собранное
 * со всех досок пространства в один канбан. Никакого отдельного
 * хранилища/копии данных нет: перетаскивание и редактирование здесь
 * бьют в тот же PATCH /api/tasks/[id], что и обычная доска, поэтому
 * изменения сразу видны и на исходной доске (через её собственный
 * фоновый polling), и наоборот.
 */
export function MyTasksBoard({
  workspaceId,
  initialTasks,
  initialDoneWeek,
  initialDoneWeeks,
  allUsers,
  currentUserEmail,
  initialOpenTaskId,
}: {
  workspaceId: string;
  initialTasks: TaskWithBoard[];
  initialDoneWeek?: string;
  initialDoneWeeks?: { weekKey: string; count: number }[];
  allUsers: User[];
  currentUserEmail: string;
  initialOpenTaskId?: string;
}) {
  const isDarkGlass = useDarkGlass();
  const [tasks, setTasks] = React.useState(initialTasks);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<TaskWithBoard | undefined>(() =>
    initialOpenTaskId ? initialTasks.find((t) => t.id === initialOpenTaskId) : undefined,
  );
  // Ссылка нужна фоновому опросу: он не дёргает сервер, пока открыт диалог.
  const [search, setSearch] = React.useState("");
  const [assigneeFilter, setAssigneeFilter] = React.useState<string>("all");
  const [stageFilter, setStageFilter] = React.useState<StatusFilterValue>("all");
  // Недельное архивирование «Готово» — см. lib/week.ts и kanban-board.tsx.
  const [doneWeek, setDoneWeek] = React.useState(initialDoneWeek ?? "");
  const [doneWeeks, setDoneWeeks] = React.useState(initialDoneWeeks ?? []);
  const doneWeekRef = React.useRef(doneWeek);
  React.useEffect(() => {
    doneWeekRef.current = doneWeek;
  }, [doneWeek]);

  React.useEffect(() => {
    if (initialOpenTaskId) {
      const task = initialTasks.find((t) => t.id === initialOpenTaskId);
      if (task) setDialogOpen(true);
    }
    // Открываем только один раз при заходе по ссылке из списка «Мои задачи».
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dialogOpenRef = React.useRef(dialogOpen);
  React.useEffect(() => {
    dialogOpenRef.current = dialogOpen;
  }, [dialogOpen]);

  // Отмечаем «Мои задачи» как просмотренные — по этой метке шапка понимает,
  // что новых изменений с прошлого визита не появилось.
  React.useEffect(() => {
    if (tasks.length === 0) return;
    const latest = tasks.reduce(
      (max, t) => (t.updatedAt > max ? t.updatedAt : max),
      tasks[0].updatedAt,
    );
    localStorage.setItem(`ttt_last_seen_my_tasks_${workspaceId}`, latest);
  }, [tasks, workspaceId]);

  React.useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (document.hidden || dialogOpenRef.current) return;
      try {
        const res = await fetch(`/api/tasks/mine?workspaceId=${workspaceId}&doneWeek=${doneWeekRef.current}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setTasks(data.tasks);
          if (data.doneWeeks) setDoneWeeks(data.doneWeeks);
        }
      } catch {
        // Тихо игнорируем — это фоновая, необязательная проверка.
      }
    }

    const interval = setInterval(poll, 12_000);
    function onVisibilityChange() {
      if (!document.hidden) poll();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [workspaceId]);

  // Смена недели в пикере «Готово» — сразу подтягиваем задачи этой недели.
  // Первый рендер пропускаем: initialTasks уже соответствуют initialDoneWeek.
  const skipNextDoneWeekFetch = React.useRef(true);
  React.useEffect(() => {
    if (skipNextDoneWeekFetch.current) {
      skipNextDoneWeekFetch.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tasks/mine?workspaceId=${workspaceId}&doneWeek=${doneWeek}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setTasks(data.tasks);
          if (data.doneWeeks) setDoneWeeks(data.doneWeeks);
        }
      } catch {
        // Тихо игнорируем.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doneWeek, workspaceId]);

  // «Закрытые задачи» — по умолчанию показываем весь архив (все недели),
  // с бейджем недели на каждой карточке; при возврате к «Любой статус» —
  // снова текущая неделя (см. тот же паттерн в kanban-board.tsx).
  const prevStageFilterRef = React.useRef(stageFilter);
  React.useEffect(() => {
    const prev = prevStageFilterRef.current;
    prevStageFilterRef.current = stageFilter;
    if (prev === stageFilter) return;
    if (stageFilter === "closed") {
      setDoneWeek(ALL_WEEKS);
    } else if (stageFilter === "all" && prev === "closed") {
      setDoneWeek(getCurrentWeekKey());
    }
  }, [stageFilter]);

  const usersByEmail = React.useMemo(() => {
    const map = new Map<string, User>();
    for (const u of allUsers) map.set(u.email, u);
    return map;
  }, [allUsers]);

  const counts = React.useMemo(() => {
    const base: Record<StageId, number> = { todo: 0, in_progress: 0, review: 0, done: 0 };
    for (const t of tasks) base[t.stage]++;
    return base;
  }, [tasks]);

  // Все фильтры тулбара комбинируются по И поверх уже загруженного списка
  // задач — без повторных запросов к серверу.
  const visibleTasks = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (
        query &&
        !t.title.toLowerCase().includes(query) &&
        !t.description.toLowerCase().includes(query)
      ) {
        return false;
      }
      if (assigneeFilter !== "all" && !t.assigneeEmails.includes(assigneeFilter)) return false;
      if (stageFilter === "open" && t.stage === "done") return false;
      if (stageFilter === "closed" && t.stage !== "done") return false;
      return true;
    });
  }, [tasks, search, assigneeFilter, stageFilter]);

  const filtersActive = search.trim() !== "" || assigneeFilter !== "all" || stageFilter !== "all";

  function openEdit(task: Task) {
    // TodaySidebar типизирован для обычных Task[], но по факту здесь
    // всегда лежат TaskWithBoard — та же ссылка на объект из `tasks`.
    setEditingTask(task as TaskWithBoard);
    setDialogOpen(true);
  }

  function handleUpdated(task: Task) {
    // TaskDialog возвращает обновлённую задачу без boardName — сохраняем
    // прежнее название доски, только сливаем остальные изменённые поля.
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...task } : t)));
  }

  function handleDeleted(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  }



  /**
   * «Мои задачи» группируются не по этапам, а по срочности: человеку важно
   * «что горит», а не «в какой колонке лежит». Готовые вынесены в конец
   * отдельной группой — они уже никуда не торопят.
   */
  const now = new Date();
  const groups = React.useMemo(() => {
    const open = visibleTasks.filter((t) => t.stage !== "done");
    const done = visibleTasks.filter((t) => t.stage === "done");
    const overdue = open.filter((t) => isOverdue(t, now));
    const today = open.filter((t) => isDueToday(t, now));
    const rest = open.filter((t) => !isOverdue(t, now) && !isDueToday(t, now));
    return [
      {
        id: "overdue",
        label: "Просрочено",
        icon: AlertTriangle,
        tone: "text-[var(--color-danger)]",
        tasks: overdue.sort(compareTasks),
      },
      {
        id: "today",
        label: "Сегодня",
        icon: CalendarClock,
        tone: "text-[var(--color-ink)]",
        tasks: today.sort(compareTasks),
      },
      {
        id: "soon",
        label: "Скоро",
        icon: CalendarDays,
        tone: "text-[var(--color-ink)]",
        tasks: rest.filter((t) => t.dueDate).sort(compareTasks),
      },
      {
        id: "nodue",
        label: "Без срока",
        icon: Inbox,
        tone: "text-[var(--color-ink)]",
        tasks: rest.filter((t) => !t.dueDate).sort(compareTasks),
      },
      {
        id: "done",
        label: "Готово",
        icon: CheckCircle2,
        tone: "text-[var(--color-stage-done)]",
        tasks: done.sort(compareTasks),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTasks]);

  return (
    <div>
      {!isDarkGlass && <StageRail counts={counts} total={tasks.length} />}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between",
              isDarkGlass && "panel relative z-20 border-solid p-2.5",
            )}
          >
            <div className="relative w-full sm:max-w-56">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-ink-soft)]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по задачам…"
                className="h-8 pl-8 text-xs"
                aria-label="Поиск по названию и описанию"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusFilterDropdown value={stageFilter} onChange={setStageFilter} />

              <Select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="h-8 w-auto text-xs"
                aria-label="Фильтр по исполнителю"
              >
                <option value="all">Все исполнители</option>
                {allUsers.map((m) => (
                  <option key={m.email} value={m.email}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {tasks.length > 0 && visibleTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-(--radius-card) border border-dashed border-[var(--color-line)] py-16 text-center">
              <SearchX className="size-5 text-[var(--color-ink-soft)]" />
              <span className="text-sm text-[var(--color-ink-soft)]">Ничего не найдено</span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {groups.map((group) => {
                const Icon = group.icon;
                return (
                  <section
                    key={group.id}
                    className={cn(
                      isDarkGlass
                        ? "panel border-solid p-4"
                        : "rounded-(--radius-card) border border-[var(--color-line)] bg-[var(--color-paper-raised)]/60 p-4",
                    )}
                  >
                    <div className="mb-3 flex items-center gap-2">
                      <Icon className={cn("size-4", group.tone)} />
                      <h2
                        className={cn(
                          isDarkGlass
                            ? "font-display text-[15px] font-semibold"
                            : "text-base font-semibold",
                          group.tone,
                        )}
                      >
                        {group.label}
                      </h2>
                      <span
                        className={cn(
                          "rounded-full bg-[var(--color-paper)] font-mono text-[var(--color-ink-soft)]",
                          isDarkGlass
                            ? "px-1.5 py-0.5 text-[11px] font-semibold"
                            : "px-2 py-0.5 text-xs",
                        )}
                      >
                        {group.tasks.length}
                      </span>
                      {group.id === "done" &&
                        (stageFilter === "all" || stageFilter === "closed") && (
                          <span className="ml-auto">
                            <WeekPicker value={doneWeek} weeks={doneWeeks} onChange={setDoneWeek} />
                          </span>
                        )}
                    </div>

                    {group.tasks.length === 0 ? (
                      <p
                        className={cn(
                          "text-[var(--color-ink-soft)]",
                          isDarkGlass ? "px-1 pb-1 text-xs" : "text-sm",
                        )}
                      >
                        {filtersActive ? "Нет подходящих задач" : "Пусто"}
                      </p>
                    ) : (
                      <div
                        className={cn(
                          "grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3",
                          isDarkGlass ? "gap-2" : "gap-3",
                        )}
                      >
                        {group.tasks.map((task) => (
                          <TaskCard
                            key={task.id}
                            task={task}
                            boardName={task.boardName}
                            assignees={task.assigneeEmails
                              .map((e) => usersByEmail.get(e))
                              .filter((u): u is User => Boolean(u))}
                            onOpen={() => openEdit(task)}
                            draggable={false}
                            onDragStart={() => {}}
                            showCompletedWeek={group.id === "done" && doneWeek === ALL_WEEKS}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}
        </div>

        <aside className="w-full shrink-0 lg:w-72">
          <TodaySidebar tasks={tasks} usersByEmail={usersByEmail} onOpen={openEdit} />
        </aside>
      </div>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        boardId={editingTask?.boardId ?? ""}
        members={allUsers}
        task={editingTask}
        currentUserEmail={currentUserEmail}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
        onArchived={handleDeleted}
      />
    </div>
  );
}
