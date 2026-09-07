"use client";

import * as React from "react";
import { toast } from "sonner";
import { Inbox, Search, SearchX } from "lucide-react";
import { StageRail } from "@/components/stage-rail";
import { StatusFilterDropdown, type StatusFilterValue } from "@/components/status-filter-dropdown";
import { TaskCard } from "@/components/task-card";
import { TaskDialog } from "@/components/task-dialog";
import { TodaySidebar } from "@/components/today-sidebar";
import { WeekPicker } from "@/components/week-picker";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { STAGES, type StageId } from "@/lib/schema";
import { compareTasks } from "@/lib/task-sort";
import { ALL_WEEKS, getCurrentWeekKey } from "@/lib/week";
import type { Task, TaskWithBoard, User } from "@/lib/models";
import { cn } from "@/lib/utils";

const STAGE_ACCENT: Record<StageId, string> = {
  todo: "var(--color-stage-todo)",
  in_progress: "var(--color-stage-progress)",
  review: "var(--color-stage-review)",
  done: "var(--color-stage-done)",
};

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
  const [tasks, setTasks] = React.useState(initialTasks);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<TaskWithBoard | undefined>(() =>
    initialOpenTaskId ? initialTasks.find((t) => t.id === initialOpenTaskId) : undefined,
  );
  const [dragOverStage, setDragOverStage] = React.useState<StageId | null>(null);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
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
  const draggingIdRef = React.useRef(draggingId);
  React.useEffect(() => {
    dialogOpenRef.current = dialogOpen;
  }, [dialogOpen]);
  React.useEffect(() => {
    draggingIdRef.current = draggingId;
  }, [draggingId]);

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
      if (document.hidden || dialogOpenRef.current || draggingIdRef.current) return;
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
      if (assigneeFilter !== "all" && t.assigneeEmail !== assigneeFilter) return false;
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

  async function moveTask(taskId: string, stage: StageId) {
    const previous = tasks;
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, stage } : t)));
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    if (!res.ok) {
      setTasks(previous);
      toast.error("Не удалось перенести задачу");
    }
  }

  function handleDrop(e: React.DragEvent, stage: StageId) {
    e.preventDefault();
    setDragOverStage(null);
    const taskId = e.dataTransfer.getData("text/task-id");
    setDraggingId(null);
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.stage !== stage) {
      moveTask(taskId, stage);
    }
  }

  return (
    <div>
      <StageRail counts={counts} total={tasks.length} />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {STAGES.map((stage) => {
                const stageTasks = visibleTasks.filter((t) => t.stage === stage.id).sort(compareTasks);
                const isOver = dragOverStage === stage.id;
                return (
                  <div
                    key={stage.id}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOverStage(stage.id);
                    }}
                    onDragLeave={() => setDragOverStage((s) => (s === stage.id ? null : s))}
                    onDrop={(e) => handleDrop(e, stage.id)}
                    className={cn(
                      "flex flex-col gap-3 rounded-(--radius-card) border border-dashed border-transparent p-2 transition-colors",
                      isOver && "border-[var(--color-signal)] bg-[var(--color-signal-soft)]/40",
                    )}
                  >
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: STAGE_ACCENT[stage.id] }}
                        />
                        <span className="text-sm font-medium">{stage.label}</span>
                        <span className="font-mono text-xs text-[var(--color-ink-soft)]">
                          {stageTasks.length}
                        </span>
                      </div>
                      {stage.id === "done" && (stageFilter === "all" || stageFilter === "closed") && (
                        <WeekPicker value={doneWeek} weeks={doneWeeks} onChange={setDoneWeek} />
                      )}
                    </div>

                    <div className="flex min-h-24 flex-col gap-2">
                      {stageTasks.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-(--radius-card) border border-dashed border-[var(--color-line)] py-6 text-center">
                          <Inbox className="size-4 text-[var(--color-ink-soft)]" />
                          <span className="text-xs text-[var(--color-ink-soft)]">
                            {filtersActive ? "Нет подходящих задач" : "Пусто"}
                          </span>
                        </div>
                      ) : (
                        stageTasks.map((task) => (
                          <div key={task.id} className={cn(draggingId === task.id && "opacity-40")}>
                            <TaskCard
                              task={task}
                              boardName={task.boardName}
                              assignee={task.assigneeEmail ? usersByEmail.get(task.assigneeEmail) : undefined}
                              onOpen={() => openEdit(task)}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/task-id", task.id);
                                setDraggingId(task.id);
                              }}
                              onDragEnd={() => setDraggingId(null)}
                              showCompletedWeek={stage.id === "done" && doneWeek === ALL_WEEKS}
                            />
                          </div>
                        ))
                      )}
                    </div>
                  </div>
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
      />
    </div>
  );
}
