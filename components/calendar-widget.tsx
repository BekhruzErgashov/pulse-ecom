"use client";

import * as React from "react";
import { toast } from "sonner";
import { Calendar, ExternalLink, Loader2, RefreshCw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [status, setStatus] = React.useState<Status>(initialStatus);
  const [loading, setLoading] = React.useState(false);
  const [disconnecting, setDisconnecting] = React.useState(false);

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
