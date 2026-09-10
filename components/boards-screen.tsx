"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { ListChecks, Plus } from "lucide-react";
import { BoardsBanner } from "@/components/boards-banner";
import { BoardsGrid } from "@/components/boards-grid";
import { CalendarWidget } from "@/components/calendar-widget";
import { ActivityWeekChart } from "@/components/activity-week-chart";
import { CreateBoardDialog } from "@/components/create-board-dialog";
import type { BoardWithProgress, GoogleCalendarEvent } from "@/lib/models";

type CalendarStatus =
  | { connected: false }
  | { connected: true; needsReconnect: true }
  | { connected: true; needsReconnect: false; events: GoogleCalendarEvent[] };

const WEEK_LABELS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

/**
 * Экран «Доски задач» — по редизайну (HANDOFF.md) в тёмной теме получает
 * полностью новую раскладку (баннер-подложка, 4 карточки-статистики,
 * сетка досок + правая колонка с календарём и графиком активности); в
 * светлой теме рендерит РОВНО прежний набор компонентов (BoardsBanner как
 * дискретная кликабельная плашка + BoardsGrid + внешний CalendarWidget в
 * aside) без единого изменения. Теми ветвями здесь, а не в page.tsx,
 * потому что useTheme — клиентский хук, а страница — серверный компонент.
 */
export function BoardsScreen({
  boards,
  workspaceId,
  calendarConfigured,
  calendarStatus,
  calendarError,
  calendarJustConnected,
  activityCounts,
}: {
  boards: BoardWithProgress[];
  workspaceId: string;
  calendarConfigured: boolean;
  calendarStatus: CalendarStatus;
  calendarError?: string;
  calendarJustConnected?: boolean;
  activityCounts: number[];
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const isDarkGlass = mounted && resolvedTheme === "dark-glass";

  const [liveBoards, setLiveBoards] = React.useState(boards);
  const [unseenIds, setUnseenIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    const unseen = new Set<string>();
    for (const board of liveBoards) {
      if (!board.latestTaskAt) continue;
      const lastSeen = localStorage.getItem(`ttt_last_seen_${board.id}`);
      if (!lastSeen || board.latestTaskAt > lastSeen) unseen.add(board.id);
    }
    setUnseenIds(unseen);
  }, [liveBoards]);

  if (!isDarkGlass) {
    return (
      <>
        <div className="min-w-0 flex-1">
          <BoardsBanner workspaceId={workspaceId} />
          <BoardsGrid initialBoards={boards} workspaceId={workspaceId} />
        </div>
        <aside className="hidden w-52 shrink-0 lg:block">
          <div className="sticky top-10">
            <CalendarWidget
              workspaceId={workspaceId}
              configured={calendarConfigured}
              initialStatus={calendarStatus}
              calendarError={calendarError}
              justConnected={calendarJustConnected}
            />
          </div>
        </aside>
      </>
    );
  }

  const totalBoards = liveBoards.length;
  const totalTasksAll = liveBoards.reduce((s, b) => s + b.taskCount, 0);
  const totalDone = liveBoards.reduce((s, b) => s + b.doneCount, 0);
  const activeTasks = totalTasksAll - totalDone;
  const avgPct = totalTasksAll === 0 ? 0 : Math.round((totalDone / totalTasksAll) * 100);
  const avgPctDeg = Math.round(avgPct * 3.6);

  return (
    <div className="relative flex flex-col gap-[22px]">
      <div className="flex items-center justify-end gap-2.5">
        <Link
          href={`/w/${workspaceId}/my-tasks`}
          className="flex h-[38px] items-center gap-1.5 rounded-xl px-4 text-[13px] font-semibold text-white"
          style={{ border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.04)" }}
        >
          <ListChecks className="size-[15px]" /> Мои задачи
        </Link>
        <CreateBoardDialog
          workspaceId={workspaceId}
          onCreated={(b) => setLiveBoards((prev) => [b, ...prev])}
          trigger={
            <button
              type="button"
              className="flex h-[38px] items-center gap-1.5 rounded-xl px-4 text-[13px] font-bold text-white"
              style={{ background: "linear-gradient(155deg, var(--color-signal), var(--color-signal-deep))", boxShadow: "0 8px 22px #5b9dff45" }}
            >
              <Plus className="size-[15px]" /> Новая доска
            </button>
          }
        />
      </div>

      {/* Карточки статистики — по референсу пользователя: не 4 отдельные
          карточки, а ОДНА единая панель, поделённая на 4 секции тонкими
          вертикальными разделителями (border-right у первых трёх
          секций). Без иконок и без цветных полосок снизу — просто
          подпись (приглушённый серый) над крупным белым числом; в
          последней секции — кольцо-график с процентом, как раньше. */}
      <div
        className="grid grid-cols-4 overflow-hidden rounded-[18px] border"
        // 0.035→0.09 — по правке «дороже вид всего сайта»: тот же скачок
        // альфы, что применён к .panel в globals.css, перенесён сюда вручную,
        // потому что эта панель стилизована инлайн-стилями, а не классом
        // .panel, и иначе не подхватила бы общее усиление стекла.
        style={{ background: "rgba(255,255,255,0.09)", borderColor: "var(--color-line-glass)" }}
      >
        <div className="border-r px-7 py-6" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <p className="m-0 mb-2 text-[13px]" style={{ color: "#8b8aa3" }}>
            Досок
          </p>
          {/* 28px→40px — большие цифры это ровно тот случай, когда
              «большой номер + маленькая подпись» должен реально
              выглядеть большим (см. остальные заголовки этой правки). */}
          <p className="font-display m-0 text-[40px] leading-none font-bold text-white">{totalBoards}</p>
        </div>
        <div className="border-r px-7 py-6" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <p className="m-0 mb-2 text-[13px]" style={{ color: "#8b8aa3" }}>
            Активных задач
          </p>
          <p className="font-display m-0 text-[40px] leading-none font-bold text-white">{activeTasks}</p>
        </div>
        <div className="border-r px-7 py-6" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <p className="m-0 mb-2 text-[13px]" style={{ color: "#8b8aa3" }}>
            Выполнено
          </p>
          <p className="font-display m-0 text-[40px] leading-none font-bold text-white">{totalDone}</p>
        </div>
        <div className="flex items-center gap-3.5 px-7 py-6">
          <div
            className="relative flex size-[52px] shrink-0 items-center justify-center rounded-full"
            style={{
              background: `conic-gradient(var(--color-signal) 0deg ${avgPctDeg}deg, rgba(255,255,255,0.10) ${avgPctDeg}deg 360deg)`,
            }}
          >
            <div
              className="font-display absolute inset-[5px] flex items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: "#0d0f22" }}
            >
              {avgPct}%
            </div>
          </div>
          <p className="m-0 text-[13px] leading-tight" style={{ color: "#8b8aa3" }}>
            Общий
            <br />
            прогресс
          </p>
        </div>
      </div>

      <div className="relative z-[1] flex flex-wrap items-start gap-5">
        <div className="grid min-w-[520px] flex-1 grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-[18px]">
          {liveBoards.map((board) => {
            const pct = board.taskCount === 0 ? 0 : Math.round((board.doneCount / board.taskCount) * 100);
            const hasUnseen = unseenIds.has(board.id);
            return (
              <Link
                key={board.id}
                href={`/w/${workspaceId}/boards/${board.id}`}
                className="flex flex-col gap-4 rounded-[20px] border p-5 transition-[transform,border-color] duration-200 hover:-translate-y-[3px]"
                style={{
                  // Тот же скачок альфы/blur/тени, что у .panel в
                  // globals.css (0.045→0.11 в терминах той же шкалы, здесь
                  // 0.1 — карточка доски крупнее рядовой .panel-карточки,
                  // чуть менее плотная альфа держит баланс с текстом внутри).
                  background: "rgba(255,255,255,0.1)",
                  borderColor: "var(--color-line-glass)",
                  backdropFilter: "blur(32px) saturate(155%)",
                  WebkitBackdropFilter: "blur(32px) saturate(155%)",
                  boxShadow: "0 20px 48px -16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.12)",
                }}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display m-0 text-[16.5px] font-semibold tracking-[-0.005em] text-white">
                      {board.name}
                    </h3>
                    {hasUnseen && (
                      <span
                        className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold"
                        style={{ background: "rgba(91,157,255,0.13)", color: "var(--color-signal-light)" }}
                      >
                        <span className="size-[5px] rounded-full" style={{ background: "var(--color-signal)" }} />
                        Новое
                      </span>
                    )}
                  </div>
                  {board.description && (
                    <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed" style={{ color: "#a8a7c4" }}>
                      {board.description}
                    </p>
                  )}
                </div>
                <div className="mt-auto flex flex-col gap-2">
                  <div className="font-label flex justify-between text-[11px] text-white">
                    <span>
                      {board.doneCount}/{board.taskCount} готово
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.08)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: "linear-gradient(90deg, var(--color-signal), var(--color-signal-light))" }}
                    />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <aside className="flex w-[270px] shrink-0 flex-col gap-3.5">
          <CalendarWidget
            workspaceId={workspaceId}
            configured={calendarConfigured}
            initialStatus={calendarStatus}
            calendarError={calendarError}
            justConnected={calendarJustConnected}
          />
          <ActivityWeekChart counts={activityCounts} labels={WEEK_LABELS} />
        </aside>
      </div>
    </div>
  );
}
