"use client";

import * as React from "react";
import { useDarkGlass } from "@/lib/use-dark-glass";
import { toast } from "sonner";
import { Calendar, ChevronLeft, ChevronRight, ExternalLink, Loader2, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { GoogleCalendarEvent } from "@/lib/models";

type Status =
  | { connected: false }
  | { connected: true; needsReconnect: true }
  | { connected: true; needsReconnect: false; events: GoogleCalendarEvent[] };

const ERROR_MESSAGES: Record<string, string> = {
  not_configured: "Google Calendar ещё не настроен на сервере",
  state: "Не удалось подключить календарь — попробуйте ещё раз",
  denied: "Подключение отменено",
  failed: "Не удалось подключить календарь",
};

const WEEKDAY_LABELS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/** Цвет точки у события — циклический набор по порядку в списке. Реальный
 *  цвет события Google отдаёт только отдельным запросом в Colors API на
 *  каждый colorId — не тот объём ради декоративной точки. */
const EVENT_DOT_COLORS = ["#f0a94e", "#4e7fe0", "#8b7cf6", "#4fb8d6", "#d66b93"];

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Сетка дат месяца, понедельник первым столбцом, с «хвостами» соседних
 *  месяцев, чтобы строк всегда было кратно 7. */
function buildMonthGrid(viewMonth: Date): { date: Date; inMonth: boolean }[] {
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < totalCells; i++) {
    const date = new Date(year, month, i - firstWeekday + 1);
    cells.push({ date, inMonth: date.getMonth() === month });
  }
  return cells;
}

function formatMonthLabel(d: Date): string {
  const label = d.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/** Убирает calendar/calendar_error из адресной строки, чтобы сообщение не всплывало повторно при обновлении страницы. */
function cleanUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("calendar");
  url.searchParams.delete("calendar_error");
  window.history.replaceState({}, "", url.toString());
}

/** Раз в минуту тихо опрашивает встречи на сегодня — по образцу фонового поллинга досок (kanban-board.tsx), только с более длинным интервалом (события в календаре меняются не так часто, как задачи). */
const CALENDAR_POLL_INTERVAL_MS = 60_000;

async function fetchCalendarStatus(): Promise<Status | null> {
  try {
    const res = await fetch("/api/google-calendar/events");
    if (res.ok) return (await res.json()) as Status;
  } catch {
    // Тихо игнорируем — это фоновая, необязательная проверка.
  }
  return null;
}

export function CalendarWidget({
  workspaceId,
  configured,
  initialStatus,
  calendarError,
  justConnected,
}: {
  workspaceId: string;
  configured: boolean;
  initialStatus: Status;
  calendarError?: string;
  justConnected?: boolean;
}) {
  const isDarkGlass = useDarkGlass();
  const [status, setStatus] = React.useState<Status>(initialStatus);
  const [loading, setLoading] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);
  const [viewMonth, setViewMonth] = React.useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const today = new Date();
  const gridCells = React.useMemo(() => buildMonthGrid(viewMonth), [viewMonth]);

  React.useEffect(() => {
    if (calendarError) {
      toast.error(ERROR_MESSAGES[calendarError] ?? "Не удалось подключить календарь");
      cleanUrl();
    } else if (justConnected) {
      toast.success("Google Calendar подключён");
      cleanUrl();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reload() {
    setLoading(true);
    try {
      const data = await fetchCalendarStatus();
      if (data) setStatus(data);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (!configured) return;
    let cancelled = false;

    async function poll() {
      if (document.hidden) return;
      const data = await fetchCalendarStatus();
      if (data && !cancelled) setStatus(data);
    }

    const interval = setInterval(poll, CALENDAR_POLL_INTERVAL_MS);
    function onVisibilityChange() {
      if (!document.hidden) poll();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [configured]);

  async function disconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/google-calendar/disconnect", { method: "POST" });
      if (res.ok) {
        setStatus({ connected: false });
        toast.success("Календарь отключён");
      } else {
        toast.error("Не удалось отключить календарь");
      }
    } finally {
      setDisconnecting(false);
    }
  }

  function goPrevMonth() {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }
  function goNextMonth() {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  if (isDarkGlass) {
    return (
      <div className="calendar-card-glass flex w-full flex-col gap-3.5 rounded-[18px] border p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="font-display text-[13px] font-semibold">Сегодня</h2>
            <p className="text-[11px] text-[var(--color-ink-soft)]">
              {today.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })} г.
            </p>
          </div>
          {status.connected && !status.needsReconnect && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="size-7" onClick={reload} aria-label="Обновить">
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"
                onClick={disconnect}
                disabled={disconnecting}
                aria-label="Отключить календарь"
              >
                <Unlink className="size-3.5" />
              </Button>
            </div>
          )}
        </div>

        {!configured ? (
          <p className="text-xs text-[var(--color-ink-soft)]">
            Google Calendar ещё не настроен на сервере.
          </p>
        ) : !status.connected ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-[var(--color-ink-soft)]">
              Подключите личный Google-календарь, чтобы видеть здесь события.
            </p>
            <Button asChild size="sm" variant="outline">
              <a href={`/api/google-calendar/connect?workspaceId=${workspaceId}`}>Подключить</a>
            </Button>
          </div>
        ) : status.needsReconnect ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-[var(--color-ink-soft)]">
              Доступ к календарю истёк — подключите его заново.
            </p>
            <Button asChild size="sm" variant="outline">
              <a href={`/api/google-calendar/connect?workspaceId=${workspaceId}`}>Подключить заново</a>
            </Button>
          </div>
        ) : (
          <>
            {/* Отметок на других датах нет намеренно: события запрашиваются
                только на сегодня, выдумывать остальные не из чего. */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between px-0.5">
                <button
                  type="button"
                  onClick={goPrevMonth}
                  aria-label="Предыдущий месяц"
                  className="flex size-6 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)]"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-sm font-medium">{formatMonthLabel(viewMonth)}</span>
                <button
                  type="button"
                  onClick={goNextMonth}
                  aria-label="Следующий месяц"
                  className="flex size-6 items-center justify-center rounded-full text-[var(--color-ink-soft)] hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)]"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-y-1.5">
                {WEEKDAY_LABELS.map((w) => (
                  <span key={w} className="text-center text-[11px] text-[var(--color-ink-soft)]">
                    {w}
                  </span>
                ))}
                {gridCells.map(({ date, inMonth }) => {
                  const isToday = inMonth && isSameDay(date, today);
                  return (
                    <span
                      key={date.toISOString()}
                      className={cn(
                        "mx-auto flex size-6 items-center justify-center rounded-full text-[11px]",
                        !inMonth && "text-[var(--color-ink-soft)] opacity-40",
                        inMonth && !isToday && "text-[var(--color-ink)]",
                        isToday && "bg-[var(--color-signal)] font-semibold text-white",
                      )}
                    >
                      {date.getDate()}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-[var(--color-line)] pt-4">
              <h3 className="text-sm font-semibold">События на сегодня</h3>
              {status.events.length === 0 ? (
                <p className="text-xs text-[var(--color-ink-soft)]">На сегодня событий нет.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {status.events.map((event, i) => (
                    <li key={event.id} className="flex items-start gap-2.5">
                      <span
                        className="mt-1.5 size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: EVENT_DOT_COLORS[i % EVENT_DOT_COLORS.length] }}
                      />
                      <a
                        href={event.htmlLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-w-0 flex-1 hover:opacity-80"
                      >
                        <span className="block font-mono text-xs text-[var(--color-ink-soft)]">
                          {event.allDay ? "весь день" : formatTime(event.start)}
                        </span>
                        <span className="block truncate text-sm font-medium">{event.title}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Calendar className="size-4 text-[var(--color-signal)]" />
          <h2 className="text-sm font-semibold">Сегодня</h2>
        </div>
        {status.connected && !status.needsReconnect && (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-7" onClick={reload} aria-label="Обновить">
              {loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-[var(--color-ink-soft)] hover:text-[var(--color-danger)]"
              onClick={disconnect}
              disabled={disconnecting}
              aria-label="Отключить календарь"
            >
              <Unlink className="size-3.5" />
            </Button>
          </div>
        )}
      </div>

      {!configured ? (
        <p className="text-xs text-[var(--color-ink-soft)]">
          Google Calendar ещё не настроен на сервере.
        </p>
      ) : !status.connected ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[var(--color-ink-soft)]">
            Подключите личный Google-календарь, чтобы видеть здесь встречи на сегодня.
          </p>
          <Button asChild size="sm" variant="outline">
            <a href={`/api/google-calendar/connect?workspaceId=${workspaceId}`}>Подключить</a>
          </Button>
        </div>
      ) : status.needsReconnect ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-[var(--color-ink-soft)]">
            Доступ к календарю истёк — подключите его заново.
          </p>
          <Button asChild size="sm" variant="outline">
            <a href={`/api/google-calendar/connect?workspaceId=${workspaceId}`}>Подключить заново</a>
          </Button>
        </div>
      ) : status.events.length === 0 ? (
        <p className="text-xs text-[var(--color-ink-soft)]">На сегодня встреч нет 🎉</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {status.events.map((event) => (
            <li key={event.id} className="flex flex-col gap-1 text-sm">
              <span className="w-fit shrink-0 rounded-full bg-[var(--color-signal-soft)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--color-signal-ink)]">
                {event.allDay ? "весь день" : formatTime(event.start)}
              </span>
              <a
                href={event.htmlLink}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex min-w-0 items-start gap-1 hover:text-[var(--color-signal)]"
              >
                <span className="min-w-0 flex-1 break-words">{event.title}</span>
                <ExternalLink className="mt-0.5 size-3 shrink-0 opacity-0 group-hover:opacity-100" />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
