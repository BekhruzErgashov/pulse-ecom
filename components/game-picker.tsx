"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Target, Trophy } from "lucide-react";
import { DinoGame } from "@/components/dino-game";
import { SamuraiGame } from "@/components/samurai-game";
import { DoomGame } from "@/components/doom-game";
import { GameLeaderboard } from "@/components/game-leaderboard";
import { cn } from "@/lib/utils";
import type { GameId } from "@/lib/models";

/**
 * В lucide-react нет отдельной иконки катаны (только «Sword» — прямой
 * западный меч, и «Swords» — скрещенные мечи), поэтому рисуем сами.
 * Прошли через две неудачные версии, проверенные рендером в песочнице
 * (cairosvg → PNG), прежде чем дошли до этой:
 * 1) тонкая обводка в стиле lucide — на бейдже 20px читалась как невнятная
 *    закорючка (жалоба «иконка непонятная»);
 * 2) закрашенный силуэт без явной гарды — превращался в подобие иглы/лезвия
 *    без рукояти, тоже неочевидно, что это меч.
 * Текущая версия — закрашенный клинок с заметной кривизной у остриа (сори,
 * характерный изгиб катаны) + отдельная перпендикулярная планка-гарда
 * (цуба) поверх рукояти — именно перпендикулярная гарда моментально
 * читается как «меч», в отличие от круглой точки, что использовалась
 * раньше.
 */
function KatanaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M3 21l3.6-3.6"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M5.99 15.19 8.81 18.01"
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        fill="none"
      />
      <path d="M9.71 16.83 18.09 7.19 20 4Q11.5 10.8 7.17 14.29Z" fill="currentColor" />
    </svg>
  );
}

/** Главный персонаж «Забега от дедлайнов» — тот же спрайт, что и в самой игре (public/game/character/idle.png), вместо родовой иконки. */
function RunnerIcon({ className }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/game/character/idle.png"
      alt=""
      draggable={false}
      className={cn("select-none object-contain", className)}
    />
  );
}

const GAMES: {
  id: GameId;
  title: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
  iconClassName: string;
  accent: string;
  accentSoft: string;
}[] = [
  {
    id: "samurai",
    title: "Разрезание задач",
    description: "Разрезайте летящие карточки задач катаной, не пропуская отпуска.",
    Icon: KatanaIcon,
    iconClassName: "size-6",
    accent: "var(--color-danger)",
    accentSoft: "var(--color-danger-soft)",
  },
  {
    id: "dino",
    title: "Забег от дедлайнов",
    description: "Прыгайте через дедлайны и приседайте под срочными письмами.",
    Icon: RunnerIcon,
    iconClassName: "size-9",
    accent: "var(--color-stage-done)",
    accentSoft: "var(--color-stage-done-soft)",
  },
  {
    id: "doom",
    title: "Отстрел задач",
    description: "Рейкастер-шутер: расстреливайте офисных монстров дробовиком волна за волной.",
    Icon: Target,
    iconClassName: "size-6",
    accent: "var(--color-stage-review)",
    accentSoft: "var(--color-stage-review-soft)",
  },
];

export function GamePicker({ workspaceId }: { workspaceId: string }) {
  const [selected, setSelected] = React.useState<GameId | null>(null);

  if (selected === "samurai") {
    return <SamuraiGame workspaceId={workspaceId} onExit={() => setSelected(null)} />;
  }
  if (selected === "dino") {
    return <DinoGame workspaceId={workspaceId} onExit={() => setSelected(null)} />;
  }
  if (selected === "doom") {
    return <DoomGame workspaceId={workspaceId} onExit={() => setSelected(null)} />;
  }

  return (
    <div className="flex flex-1 flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <p className="eyebrow mb-1">Мини-игры</p>
          <h1 className="text-2xl font-semibold tracking-tight">Выберите игру</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Пятиминутный перерыв — а результат сразу увидит вся команда.
          </p>
        </div>
        <Link
          href={`/w/${workspaceId}/boards`}
          className="flex items-center gap-1.5 text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-3.5" /> Все доски
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {GAMES.map((game) => (
          <button
            key={game.id}
            type="button"
            onClick={() => setSelected(game.id)}
            className="panel card-hover group relative flex flex-col items-start gap-3 overflow-hidden p-6 text-left"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute -right-10 -top-10 size-36 rounded-full opacity-70 blur-2xl transition-opacity duration-300 group-hover:opacity-100"
              style={{ backgroundColor: game.accentSoft }}
            />
            <div
              className="relative flex size-11 items-center justify-center overflow-hidden rounded-full transition-transform duration-200 group-hover:scale-110"
              style={{ backgroundColor: game.accentSoft, color: game.accent }}
            >
              <game.Icon className={game.iconClassName} />
            </div>
            <div className="relative">
              <h2 className="font-semibold tracking-tight">{game.title}</h2>
              <p className="mt-1 text-sm text-[var(--color-ink-soft)]">{game.description}</p>
            </div>
            <span className="relative mt-1 flex items-center gap-1 text-xs font-medium text-[var(--color-signal-ink)] opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              Играть <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        ))}
      </div>

      <div>
        <div className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-[var(--color-ink-soft)]">
          <Trophy className="size-3.5" />
          Доска рекордов команды
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((game) => (
            <GameLeaderboard
              key={game.id}
              workspaceId={workspaceId}
              gameId={game.id}
              title={game.title}
              className="max-w-none"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
