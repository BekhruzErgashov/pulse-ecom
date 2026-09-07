"use client";

import * as React from "react";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GameId, LeaderboardEntry } from "@/lib/models";

const MEDALS = ["🥇", "🥈", "🥉"];

/**
 * Доска рекордов мини-игры — общая для всех участников пространства (топ-10
 * по лучшему результату каждого). `refreshKey` — меняем это значение после
 * завершения раунда, чтобы список сразу подтянулся без ручного обновления
 * страницы (сам компонент не поллит фоном — рекорды не настолько срочные).
 */
export function GameLeaderboard({
  workspaceId,
  gameId,
  refreshKey,
  title = "Доска рекордов",
  className,
}: {
  workspaceId: string;
  gameId: GameId;
  refreshKey?: number;
  /** Заголовок панели — по умолчанию общий, на экране выбора игры удобнее передать название игры. */
  title?: string;
  /** Переопределяет ширину внешней обёртки (по умолчанию — компактная, под оверлей игры). */
  className?: string;
}) {
  const [entries, setEntries] = React.useState<LeaderboardEntry[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/games/scores?workspaceId=${workspaceId}&gameId=${gameId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setEntries(data.entries);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, gameId, refreshKey]);

  return (
    <div
      className={cn(
        "w-full max-w-xs rounded-(--radius-card) border border-[var(--color-line)] bg-[var(--color-paper-raised)]/95 p-3 text-left shadow-sm",
        className,
      )}
    >
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-soft)]">
        <Trophy className="size-3.5" />
        {title}
      </div>
      {loading ? (
        <p className="text-xs text-[var(--color-ink-soft)]">Загрузка…</p>
      ) : !entries || entries.length === 0 ? (
        <p className="text-xs text-[var(--color-ink-soft)]">Пока никто не играл — станьте первым!</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {entries.map((e, i) => (
            <li
              key={e.userEmail}
              className={cn(
                "flex items-center gap-2 rounded-(--radius-control) px-2 py-1 text-sm",
                e.isYou && "bg-[var(--color-signal-soft)] text-[var(--color-signal-ink)]",
              )}
            >
              <span className="w-5 shrink-0 text-center font-mono text-xs text-[var(--color-ink-soft)]">
                {MEDALS[i] ?? i + 1}
              </span>
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: e.color }}
              />
              <span className="min-w-0 flex-1 truncate">
                {e.name}
                {e.isYou && " (вы)"}
              </span>
              <span className="shrink-0 font-mono text-xs">{Math.floor(e.score)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
