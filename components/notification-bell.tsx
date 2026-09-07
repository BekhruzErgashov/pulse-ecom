"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Notification } from "@/lib/models";

/** Раз в 30–45 секунд тихо опрашивает уведомления — по образцу фонового поллинга
 * в calendar-widget.tsx / kanban-board.tsx (setInterval + document.hidden + visibilitychange). */
const POLL_INTERVAL_MS = 35_000;

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function fetchNotifications(): Promise<{ notifications: Notification[]; unread: number } | null> {
  try {
    const res = await fetch("/api/notifications");
    if (res.ok) return (await res.json()) as { notifications: Notification[]; unread: number };
  } catch {
    // Тихо игнорируем — это фоновая, необязательная проверка.
  }
  return null;
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [unread, setUnread] = React.useState(0);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      const data = await fetchNotifications();
      if (data && !cancelled) {
        setNotifications(data.notifications);
        setUnread(data.unread);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (document.hidden) return;
      const data = await fetchNotifications();
      if (data && !cancelled) {
        setNotifications(data.notifications);
        setUnread(data.unread);
      }
    }

    const interval = setInterval(poll, POLL_INTERVAL_MS);
    function onVisibilityChange() {
      if (!document.hidden) poll();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function markOneRead(id: string) {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((prev) => {
      const target = notifications.find((n) => n.id === id);
      return target && !target.read ? Math.max(0, prev - 1) : prev;
    });
    try {
      await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    } catch {
      // Необязательное фоновое действие — молча пропускаем сбой.
    }
  }

  async function markAllRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try {
      await fetch("/api/notifications", { method: "POST" });
    } catch {
      // Необязательное фоновое действие — молча пропускаем сбой.
    }
  }

  function handleItemClick(item: Notification) {
    if (!item.read) void markOneRead(item.id);
    if (item.link) {
      setOpen(false);
      router.push(item.link);
    }
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative flex size-9 items-center justify-center rounded-full text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-signal)]"
        aria-label="Уведомления"
      >
        <Bell className="size-4.5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-semibold leading-none text-[var(--color-on-accent)] ring-2 ring-[var(--color-paper-raised)]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="panel absolute right-0 z-40 mt-2 flex max-h-[28rem] w-80 flex-col overflow-hidden shadow-md animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--color-line)] px-3 py-2">
            <h2 className="text-sm font-semibold">Уведомления</h2>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-medium text-[var(--color-signal)] hover:underline"
              >
                Прочитать всё
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-xs text-[var(--color-ink-soft)]">
                Уведомлений пока нет
              </p>
            ) : (
              <ul className="flex flex-col">
                {notifications.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleItemClick(item)}
                      className={cn(
                        "flex w-full flex-col gap-0.5 border-l-2 px-3 py-2 text-left transition-colors hover:bg-[var(--color-paper)]",
                        item.read
                          ? "border-l-transparent"
                          : "border-l-[var(--color-signal)] bg-[var(--color-signal-soft)]",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "flex-1 truncate text-sm",
                            item.read ? "font-medium" : "font-semibold",
                          )}
                        >
                          {item.title}
                        </span>
                        {!item.read && (
                          <span className="size-1.5 shrink-0 rounded-full bg-[var(--color-signal)]" />
                        )}
                      </div>
                      <p className="line-clamp-2 text-xs text-[var(--color-ink-soft)]">{item.body}</p>
                      <span className="text-[11px] text-[var(--color-ink-soft)]">
                        {formatDateTime(item.createdAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
