"use client";

import * as React from "react";
import { toast } from "sonner";
import { useDarkGlass } from "@/lib/use-dark-glass";
import { Archive, ListChecks, Plus, Inbox, Search, SearchX, Trash2, X } from "lucide-react";
import { StageRail } from "@/components/stage-rail";
import { StatusFilterDropdown, type StatusFilterValue } from "@/components/status-filter-dropdown";
import { TaskCard } from "@/components/task-card";
import { TaskDialog } from "@/components/task-dialog";
import { TASKS_CHANGED_EVENT } from "@/lib/board-events";
import { TodaySidebar } from "@/components/today-sidebar";
import { WeekPicker } from "@/components/week-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { STAGES, type StageId } from "@/lib/schema";
import { compareTasks } from "@/lib/task-sort";
import { ALL_WEEKS, getCurrentWeekKey } from "@/lib/week";
import type { Task, User } from "@/lib/models";
import { cn } from "@/lib/utils";

const STAGE_ACCENT: Record<StageId, string> = {
  todo: "var(--color-stage-todo)",
  in_progress: "var(--color-stage-progress)",
  review: "var(--color-stage-review)",
  done: "var(--color-stage-done)",
};

export function KanbanBoard({
  boardId,
  initialTasks,
  initialDoneWeek,
  initialDoneWeeks,
  members,
  allUsers,
  currentUserEmail,
}: {
  boardId: string;
  initialTasks: Task[];
  initialDoneWeek?: string;
  initialDoneWeeks?: { weekKey: string; count: number }[];
  members: User[];
  allUsers: User[];
  currentUserEmail: string;
}) {
  const isDarkGlass = useDarkGlass();
  const [tasks, setTasks] = React.useState(initialTasks);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingTask, setEditingTask] = React.useState<Task | undefined>();
  const [createStage, setCreateStage] = React.useState<StageId>("todo");
  const [dragOverStage, setDragOverStage] = React.useState<StageId | null>(null);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  // Групповые действия: пока ничего не выделено, панель действий скрыта.
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [assigneeFilter, setAssigneeFilter] = React.useState<string>("all");
  const [stageFilter, setStageFilter] = React.useState<StatusFilterValue>("all");
  // Недельное архивирование «Готово» — задачи вне выбранной недели уже
  // не приходят с сервера (см. lib/week.ts), фронт только выбирает неделю.
  const [doneWeek, setDoneWeek] = React.useState(initialDoneWeek ?? "");
  const [doneWeeks, setDoneWeeks] = React.useState(initialDoneWeeks ?? []);
  const doneWeekRef = React.useRef(doneWeek);
  React.useEffect(() => {
    doneWeekRef.current = doneWeek;
  }, [doneWeek]);

  // Не даём фоновому опросу перезаписать состояние, пока человек
  // редактирует задачу в диалоге или тащит карточку — иначе можно
  // потерять то, что он сейчас делает.
  const dialogOpenRef = React.useRef(dialogOpen);
  const draggingIdRef = React.useRef(draggingId);
  React.useEffect(() => {
    dialogOpenRef.current = dialogOpen;
  }, [dialogOpen]);
  React.useEffect(() => {
    draggingIdRef.current = draggingId;
  }, [draggingId]);

  React.useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const res = await fetch(`/api/boards/${boardId}?doneWeek=${doneWeekRef.current}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setTasks(data.tasks);
          if (data.doneWeeks) setDoneWeeks(data.doneWeeks);
        }
      } catch {
        // Тихо игнорируем — обновление доски необязательное.
      }
    }

    // Фоновый опрос вежливый: не дёргает сервер, пока вкладка скрыта, открыт
    // диалог задачи или карточку тащат мышью. Обновление по явному действию
    // пользователя (см. TASKS_CHANGED_EVENT ниже) этих ограничений не имеет —
    // иначе возврат задачи из архива не был бы виден сразу.
    async function poll() {
      if (document.hidden || dialogOpenRef.current || draggingIdRef.current) return;
      await refresh();
    }

    const interval = setInterval(poll, 12_000);
    function onVisibilityChange() {
      if (!document.hidden) poll();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    // Возврат задачи из архива происходит в диалоге, который живёт в шапке
    // доски — это соседний компонент, состояние с канбаном не общее. Вместо
    // прокидывания колбэков через страницу шапка шлёт событие, а канбан по
    // нему сразу опрашивает доску, не дожидаясь 12-секундного интервала.
    function onExternalChange() {
      void refresh();
    }
    window.addEventListener(TASKS_CHANGED_EVENT, onExternalChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener(TASKS_CHANGED_EVENT, onExternalChange);
    };
  }, [boardId]);

  // Смена недели в пикере «Готово» — сразу подтягиваем задачи этой недели,
  // не дожидаясь фонового опроса. Первый рендер пропускаем: initialTasks
  // уже соответствуют initialDoneWeek.
  const skipNextDoneWeekFetch = React.useRef(true);
  React.useEffect(() => {
    if (skipNextDoneWeekFetch.current) {
      skipNextDoneWeekFetch.current = false;
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/boards/${boardId}?doneWeek=${doneWeek}`);
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
  }, [doneWeek, boardId]);

  // «Закрытые задачи» — по умолчанию показываем весь архив (все недели),
  // с бейджем недели на каждой карточке (см. TaskCard), а не только
  // текущую неделю, как в обычном виде «Любой статус». При возврате к
  // «Любой статус» из «Закрытых» — снова текущая неделя, чтобы колонка
  // «Готово» не разрасталась в основном виде доски.
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

  // Рельс этапов всегда показывает прогресс всей команды по доске —
  // так виднее общую картину, независимо от фильтров тулбара ниже.
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

  // Отмечаем задачи доски как просмотренные — по этой метке список
  // досок понимает, что новых задач с прошлого визита не появилось.
  React.useEffect(() => {
    if (tasks.length === 0) return;
    const latest = tasks.reduce(
      (max, t) => (t.createdAt > max ? t.createdAt : max),
      tasks[0].createdAt,
    );
    localStorage.setItem(`ttt_last_seen_${boardId}`, latest);
  }, [tasks, boardId]);

  function openCreate(stage: StageId) {
    setEditingTask(undefined);
    setCreateStage(stage);
    setDialogOpen(true);
  }

  function openEdit(task: Task) {
    setEditingTask(task);
    setDialogOpen(true);
  }

  function handleCreated(task: Task) {
    setTasks((prev) => [...prev, task]);
  }

  function handleUpdated(task: Task) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
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

  function toggleSelect(taskId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  /** Отметить или снять сразу список задач — колонку целиком или всю доску. */
  function toggleMany(ids: string[], select: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (select) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  /**
   * Групповое действие — это те же запросы к /api/tasks/[id], только пачкой.
   * Отдельный «массовый» эндпоинт не заводим намеренно: в нём пришлось бы
   * дублировать права, автолог истории и уведомления.
   */
  async function runBulk(
    action: (taskId: string) => Promise<Response>,
    onSuccess: (ids: string[]) => void,
    okMessage: (n: number) => string,
  ) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkPending(true);
    try {
      const results = await Promise.all(ids.map((id) => action(id).catch(() => null)));
      const okIds = ids.filter((_, i) => results[i]?.ok);
      const failed = ids.length - okIds.length;
      onSuccess(okIds);
      setSelectedIds(new Set());
      if (okIds.length > 0) toast.success(okMessage(okIds.length));
      if (failed > 0) toast.error("Не удалось обработать: " + failed);
    } finally {
      setBulkPending(false);
    }
  }

  function bulkMove(stage: StageId) {
    void runBulk(
      (id) =>
        fetch("/api/tasks/" + id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stage }),
        }),
      (ids) => setTasks((prev) => prev.map((t) => (ids.includes(t.id) ? { ...t, stage } : t))),
      (n) => "Перенесено задач: " + n,
    );
  }

  function bulkArchive() {
    void runBulk(
      (id) =>
        fetch("/api/tasks/" + id, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ archived: true }),
        }),
      (ids) => setTasks((prev) => prev.filter((t) => !ids.includes(t.id))),
      (n) => "В архив отправлено: " + n,
    );
  }

  function bulkDelete() {
    toast("Удалить задач: " + selectedIds.size + "?", {
      description:
        "Восстановить не получится. Если задачи могут ещё понадобиться — отправьте их в архив.",
      action: {
        label: "Удалить",
        onClick: () =>
          void runBulk(
            (id) => fetch("/api/tasks/" + id, { method: "DELETE" }),
            (ids) => setTasks((prev) => prev.filter((t) => !ids.includes(t.id))),
            (n) => "Удалено задач: " + n,
          ),
      },
      cancel: { label: "Отмена", onClick: () => {} },
    });
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
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  const ids = visibleTasks.map((t) => t.id);
                  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
                  toggleMany(ids, !allSelected);
                }}
                disabled={visibleTasks.length === 0}
              >
                <ListChecks className="size-3.5" />
                {visibleTasks.length > 0 && visibleTasks.every((t) => selectedIds.has(t.id))
                  ? "Снять все"
                  : "Выбрать все"}
              </Button>

              <StatusFilterDropdown value={stageFilter} onChange={setStageFilter} />

              <Select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="h-8 w-auto text-xs"
                aria-label="Фильтр по исполнителю"
              >
                <option value="all">Все исполнители</option>
                {members.map((m) => (
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
                      isDarkGlass && "panel border-solid p-4",
                      isOver && "border-[var(--color-signal)] bg-[var(--color-signal-soft)]/40",
                    )}
                  >
                    <div className="flex items-center justify-between px-1">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: STAGE_ACCENT[stage.id] }}
                        />
                        <span className="text-sm font-medium">{stage.label}</span>
                        {isDarkGlass ? (
                          <span
                            className="rounded-full px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--color-ink-soft)]"
                            style={{ backgroundColor: "var(--color-paper)" }}
                          >
                            {stageTasks.length}
                          </span>
                        ) : (
                          <span className="font-mono text-xs text-[var(--color-ink-soft)]">
                            {stageTasks.length}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        {/* Чекбокс колонки появляется, только когда выделение уже
                            начато: иначе он занимал бы место в и без того тесном
                            заголовке при каждом заходе на доску. */}
                        {selectedIds.size > 0 && stageTasks.length > 0 && (
                          <Checkbox
                            checked={stageTasks.every((t) => selectedIds.has(t.id))}
                            onChange={() => {
                              const ids = stageTasks.map((t) => t.id);
                              toggleMany(ids, !ids.every((id) => selectedIds.has(id)));
                            }}
                            aria-label={`Выделить все задачи в «${stage.label}»`}
                          />
                        )}
                        {stage.id === "done" && (stageFilter === "all" || stageFilter === "closed") && (
                          <WeekPicker value={doneWeek} weeks={doneWeeks} onChange={setDoneWeek} />
                        )}
                        <button
                          type="button"
                          onClick={() => openCreate(stage.id)}
                          className="flex items-center justify-center rounded-full bg-[var(--color-signal-soft)] p-1 text-[var(--color-signal-ink)] shadow-sm transition-colors hover:bg-[var(--color-signal)] hover:text-white"
                          aria-label={`Добавить задачу в «${stage.label}»`}
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex min-h-24 flex-col gap-2">
                      {stageTasks.length === 0 ? (
                        isDarkGlass ? (
                          <p className="px-1 py-4 text-center text-xs text-[var(--color-ink-soft)]">
                            {filtersActive ? "Нет подходящих задач" : "Пусто"}
                          </p>
                        ) : (
                          <div className="flex flex-1 flex-col items-center justify-center gap-1.5 rounded-(--radius-card) border border-dashed border-[var(--color-line)] py-6 text-center">
                            <Inbox className="size-4 text-[var(--color-ink-soft)]" />
                            <span className="text-xs text-[var(--color-ink-soft)]">
                              {filtersActive ? "Нет подходящих задач" : "Пусто"}
                            </span>
                          </div>
                        )
                      ) : (
                        stageTasks.map((task) => (
                          <div key={task.id} className={cn(draggingId === task.id && "opacity-40")}>
                            <TaskCard
                              task={task}
                              assignees={task.assigneeEmails.map((e) => usersByEmail.get(e)).filter((u): u is User => Boolean(u))}
                              onOpen={() => openEdit(task)}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("text/task-id", task.id);
                                setDraggingId(task.id);
                              }}
                              onDragEnd={() => setDraggingId(null)}
                              showCompletedWeek={stage.id === "done" && doneWeek === ALL_WEEKS}
                              selected={selectedIds.has(task.id)}
                              onToggleSelect={() => toggleSelect(task.id)}
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

      {selectedIds.size > 0 && (
        // Панель групповых действий: появляется только когда что-то отмечено,
        // висит поверх доски, чтобы не прыгать за списком при прокрутке.
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-3 py-2 shadow-lg">
          <span className="px-1 text-sm font-medium">Выбрано: {selectedIds.size}</span>
          <Select
            value=""
            onChange={(e) => {
              if (e.target.value) bulkMove(e.target.value as StageId);
              e.target.value = "";
            }}
            className="h-8 w-auto text-xs"
            aria-label="Перенести выбранные задачи в этап"
            disabled={bulkPending}
          >
            <option value="">Перенести в…</option>
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
          <Button variant="outline" size="sm" onClick={bulkArchive} disabled={bulkPending}>
            <Archive className="size-3.5" /> В архив
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={bulkDelete}
            disabled={bulkPending}
            className="text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
          >
            <Trash2 className="size-3.5" /> Удалить
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
            disabled={bulkPending}
          >
            <X className="size-3.5" /> Снять
          </Button>
        </div>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        boardId={boardId}
        members={members}
        task={editingTask}
        currentUserEmail={currentUserEmail}
        defaultStage={createStage}
        onCreated={handleCreated}
        onUpdated={handleUpdated}
        onDeleted={handleDeleted}
        onArchived={handleDeleted}
      />
    </div>
  );
}
