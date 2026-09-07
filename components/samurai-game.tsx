"use client";

import * as React from "react";
import { Flame, LogOut, Pause, Play, RotateCcw, Swords, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { GameLeaderboard } from "@/components/game-leaderboard";
import { cn } from "@/lib/utils";

type ObjKind = "board" | "vacation";

interface FlyingObject {
  id: number;
  kind: ObjKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vrot: number;
  name: string;
  total: number;
  done: number;
}

interface Shard {
  id: number;
  x: number;
  y: number;
  tx: number;
  ty: number;
  rot: number;
  kind: ObjKind;
  side: "left" | "right";
  name: string;
}

interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  danger: boolean;
}

const GRAVITY = 0.14;
const CARD_W = 220;
const CARD_H = 128;
const FALLBACK_NAMES = ["Задачи по ТДД", "Проект ПВЗ", "Задачи по Мебели", "Спринт 12", "Бэклог"];
// Раунд больше не ограничен по времени — вместо этого три порезанных
// «Отпуска» (см. sliceObject) заканчивают игру, как «жизни» в аркадах.
const MAX_VACATION_SLICES = 3;

interface RealBoard {
  name: string;
  taskCount: number;
  doneCount: number;
}

export function SamuraiGame({ workspaceId, onExit }: { workspaceId: string; onExit: () => void }) {
  const arenaRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ w: 900, h: 560 });
  const [state, setState] = React.useState<"idle" | "playing" | "ended">("idle");
  const [paused, setPaused] = React.useState(false);
  const [score, setScore] = React.useState(0);
  const [vacationSlices, setVacationSlices] = React.useState(0);
  const [best, setBest] = React.useState<number | null>(null);
  const [leaderboardKey, setLeaderboardKey] = React.useState(0);
  const [objects, setObjects] = React.useState<FlyingObject[]>([]);
  const [shards, setShards] = React.useState<Shard[]>([]);
  const [texts, setTexts] = React.useState<FloatingText[]>([]);
  const [trail, setTrail] = React.useState<{ x: number; y: number }[]>([]);

  const realBoardsRef = React.useRef<RealBoard[]>([]);
  const objectsRef = React.useRef<FlyingObject[]>([]);
  const scoreRef = React.useRef(0);
  const vacationSlicesRef = React.useRef(0);
  const nextIdRef = React.useRef(0);
  const spawnTimerRef = React.useRef(0);
  const rafRef = React.useRef<number | null>(null);
  const runningRef = React.useRef(false);
  const pausedRef = React.useRef(false);
  const pointerDownRef = React.useRef(false);
  const lastPointRef = React.useRef<{ x: number; y: number } | null>(null);
  const trailPointsRef = React.useRef<{ x: number; y: number; t: number }[]>([]);

  React.useEffect(() => {
    const stored = localStorage.getItem("ttt_samurai_best");
    if (stored) setBest(Number(stored));

    fetch(`/api/boards?workspaceId=${workspaceId}`)
      .then((res) => (res.ok ? res.json() : { boards: [] }))
      .then((data) => {
        realBoardsRef.current = (data.boards ?? []).map(
          (b: { name: string; taskCount: number; doneCount: number }) => ({
            name: b.name,
            taskCount: b.taskCount,
            doneCount: b.doneCount,
          }),
        );
      })
      .catch(() => {});
  }, [workspaceId]);

  React.useEffect(() => {
    function measure() {
      const el = arenaRef.current;
      if (el) setSize({ w: el.clientWidth, h: el.clientHeight });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  function pickBoard(): { name: string; total: number; done: number } {
    const real = realBoardsRef.current;
    if (real.length > 0) {
      const b = real[Math.floor(Math.random() * real.length)];
      return { name: b.name, total: b.taskCount, done: b.doneCount };
    }
    return {
      name: FALLBACK_NAMES[Math.floor(Math.random() * FALLBACK_NAMES.length)],
      total: 4 + Math.floor(Math.random() * 6),
      done: Math.floor(Math.random() * 3),
    };
  }

  /**
   * Сколько карточек кинуть одним «наплывом» — вперемешку одиночные
   * забросы, пары/тройки и изредка до 5 сразу, а не линейно по одной
   * (см. использование в step()).
   */
  function pickBurstSize(): number {
    const r = Math.random();
    if (r < 0.25) return 1;
    if (r < 0.55) return 2;
    if (r < 0.8) return 3;
    if (r < 0.93) return 4;
    return 5;
  }

  function spawnObject() {
    const { w, h } = size;
    const isVacation = Math.random() < 0.16;
    const fromLeft = Math.random() < 0.5;
    const x = fromLeft ? -CARD_W : w + CARD_W;
    const y = h + 40;
    // Высота и горизонтальная цель немного варьируются от заброса к
    // забросу — иначе при наплыве в несколько карточек все летят по
    // одинаковой дуге в одну точку и выглядят как один и тот же бросок
    // с задержкой (совсем не «наплыв»). Разброс умеренный, чтобы скорость
    // полёта в среднем оставалась предсказуемой.
    const heightFactor = 0.58 + Math.random() * 0.3;
    const vy = -Math.sqrt(2 * GRAVITY * h * heightFactor);
    const peakFrames = -vy / GRAVITY;
    const targetX = w * (0.32 + Math.random() * 0.36);
    const vx = (targetX - x) / peakFrames;
    const board = pickBoard();

    const obj: FlyingObject = {
      id: nextIdRef.current++,
      kind: isVacation ? "vacation" : "board",
      x,
      y,
      vx,
      vy,
      rotation: (Math.random() - 0.5) * 0.3,
      vrot: (Math.random() - 0.5) * 0.03,
      name: isVacation ? "Отпуск" : board.name,
      total: board.total,
      done: board.done,
    };
    objectsRef.current = [...objectsRef.current, obj];
  }

  function sliceObject(obj: FlyingObject) {
    objectsRef.current = objectsRef.current.filter((o) => o.id !== obj.id);
    const isVacation = obj.kind === "vacation";
    const delta = isVacation ? -20 : 10;
    scoreRef.current = Math.max(0, scoreRef.current + delta);
    setScore(scoreRef.current);

    // Три порезанных «Отпуска» — конец раунда (замена таймеру, см. константу
    // MAX_VACATION_SLICES). Проверяем после инкремента, до отрисовки шардов —
    // само разрезание всё равно должно быть видно на экране Game Over.
    if (isVacation) {
      vacationSlicesRef.current += 1;
      setVacationSlices(vacationSlicesRef.current);
      if (vacationSlicesRef.current >= MAX_VACATION_SLICES) {
        finishGame();
      }
    }

    const textId = nextIdRef.current++;
    setTexts((prev) => [
      ...prev,
      { id: textId, x: obj.x + CARD_W / 2, y: obj.y, text: isVacation ? "Штраф −20" : "+10", danger: isVacation },
    ]);
    setTimeout(() => setTexts((prev) => prev.filter((t) => t.id !== textId)), 700);

    const leftId = nextIdRef.current++;
    const rightId = nextIdRef.current++;
    setShards((prev) => [
      ...prev,
      {
        id: leftId,
        x: obj.x,
        y: obj.y,
        tx: -60 - Math.random() * 40,
        ty: -40 - Math.random() * 40,
        rot: -25 - Math.random() * 30,
        kind: obj.kind,
        side: "left",
        name: obj.name,
      },
      {
        id: rightId,
        x: obj.x,
        y: obj.y,
        tx: 60 + Math.random() * 40,
        ty: -30 - Math.random() * 40,
        rot: 25 + Math.random() * 30,
        kind: obj.kind,
        side: "right",
        name: obj.name,
      },
    ]);
    setTimeout(() => setShards((prev) => prev.filter((s) => s.id !== leftId && s.id !== rightId)), 650);
  }

  function pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  function checkSlices(x1: number, y1: number, x2: number, y2: number) {
    for (const obj of objectsRef.current) {
      const cx = obj.x + CARD_W / 2;
      const cy = obj.y + CARD_H / 2;
      const dist = pointToSegmentDist(cx, cy, x1, y1, x2, y2);
      if (dist < CARD_H * 0.7) {
        sliceObject(obj);
      }
    }
  }

  function getPoint(e: { clientX: number; clientY: number }) {
    const el = arenaRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (state !== "playing" || pausedRef.current) return;
    e.preventDefault();
    pointerDownRef.current = true;
    const p = getPoint(e);
    lastPointRef.current = p;
    // eslint-disable-next-line react-hooks/purity -- обработчик указателя, не рендер
    trailPointsRef.current.push({ ...p, t: performance.now() });
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!pointerDownRef.current) return;
    const p = getPoint(e);
    const last = lastPointRef.current;
    // eslint-disable-next-line react-hooks/purity -- обработчик указателя, не рендер
    trailPointsRef.current.push({ ...p, t: performance.now() });
    if (trailPointsRef.current.length > 12) trailPointsRef.current.shift();
    setTrail(trailPointsRef.current.map((pt) => ({ x: pt.x, y: pt.y })));
    if (last) checkSlices(last.x, last.y, p.x, p.y);
    lastPointRef.current = p;
  }

  function handlePointerUp() {
    pointerDownRef.current = false;
    lastPointRef.current = null;
  }

  function step() {
    if (!runningRef.current) return;
    if (!pausedRef.current) {
      spawnTimerRef.current -= 1;
      if (spawnTimerRef.current <= 0) {
        // eslint-disable-next-line react-hooks/purity -- игровой цикл, не рендер
        const burstSize = pickBurstSize();
        for (let i = 0; i < burstSize; i++) spawnObject();
        // Пауза до следующего наплыва растёт вместе с его размером — иначе
        // после пятёрки карточек экран сразу заваливает следующей волной.
        // eslint-disable-next-line react-hooks/purity -- игровой цикл, не рендер
        spawnTimerRef.current = 55 + burstSize * 16 + Math.random() * 55;
      }

      const { w, h } = size;
      objectsRef.current = objectsRef.current
        .map((obj) => ({
          ...obj,
          x: obj.x + obj.vx,
          y: obj.y + obj.vy,
          vy: obj.vy + GRAVITY,
          rotation: obj.rotation + obj.vrot,
        }))
        .filter((obj) => obj.y < h + CARD_H * 2 && obj.x > -CARD_W * 2 && obj.x < w + CARD_W * 2);

      setObjects(objectsRef.current);

      // eslint-disable-next-line react-hooks/purity -- игровой цикл, не рендер
      const now = performance.now();
      const freshTrail = trailPointsRef.current.filter((p) => now - p.t < 180);
      if (freshTrail.length !== trailPointsRef.current.length) {
        trailPointsRef.current = freshTrail;
        setTrail(freshTrail.map((p) => ({ x: p.x, y: p.y })));
      }
    }
    rafRef.current = requestAnimationFrame(step);
  }

  function resetGameState() {
    objectsRef.current = [];
    setObjects([]);
    setShards([]);
    setTexts([]);
    setTrail([]);
    trailPointsRef.current = [];
    scoreRef.current = 0;
    vacationSlicesRef.current = 0;
    spawnTimerRef.current = 20;
    setScore(0);
    setVacationSlices(0);
  }

  function startGame() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    resetGameState();
    setState("playing");
    setPaused(false);
    pausedRef.current = false;
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(step);
  }

  function togglePause() {
    setPaused((prev) => {
      pausedRef.current = !prev;
      return !prev;
    });
  }

  function finishGame() {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setState("ended");
    const finalScore = scoreRef.current;
    setBest((prevBest) => {
      if (prevBest === null || finalScore > prevBest) {
        localStorage.setItem("ttt_samurai_best", String(finalScore));
        return finalScore;
      }
      return prevBest;
    });
    // Отправляем результат в общую доску рекордов пространства — сохранится,
    // только если он выше уже сохранённого (см. upsertGameScore).
    fetch("/api/games/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, gameId: "samurai", score: finalScore }),
    })
      .then(() => setLeaderboardKey((k) => k + 1))
      .catch(() => {});
  }

  React.useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div className="relative mt-8 flex-1">
      <div
        ref={arenaRef}
        className="relative min-h-[60vh] w-full touch-none select-none overflow-hidden rounded-(--radius-card) border border-dashed border-[var(--color-line)]"
        style={{ WebkitUserSelect: "none", userSelect: "none" }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onDragStart={(e) => e.preventDefault()}
      >
        {state === "playing" && (
          <div className="absolute right-3 top-3 z-30 flex gap-2">
            <Button variant="outline" size="icon" onClick={togglePause} title={paused ? "Продолжить" : "Пауза"}>
              {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            </Button>
            <Button variant="outline" size="icon" onClick={startGame} title="Начать заново">
              <RotateCcw className="size-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={finishGame} title="Завершить раунд">
              <X className="size-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={onExit} title="Выйти из игры">
              <LogOut className="size-4" />
            </Button>
          </div>
        )}

        {state === "playing" && (
          <div className="absolute left-3 top-3 z-30 flex items-center gap-3 rounded-full bg-[var(--color-paper-raised)]/90 px-3 py-1.5 text-sm shadow-sm backdrop-blur">
            <span className="flex items-center gap-1.5 font-mono">
              <Swords className="size-3.5 text-[var(--color-signal)]" />
              {score}
            </span>
            {/* Раунд без таймера — вместо него «жизни»: три порезанных отпуска и игра окончена. */}
            <span
              className={cn(
                "flex items-center gap-1 font-mono text-xs",
                vacationSlices >= MAX_VACATION_SLICES - 1
                  ? "font-semibold text-[var(--color-danger)]"
                  : "text-[var(--color-ink-soft)]",
              )}
              title="Порезанные отпуска — три и игра закончится"
            >
              🏖 {vacationSlices}/{MAX_VACATION_SLICES}
            </span>
          </div>
        )}

        {objects.map((obj) => {
          const pct = obj.total ? Math.round((obj.done / obj.total) * 100) : 0;
          const isVacation = obj.kind === "vacation";
          return (
            <div
              key={obj.id}
              className={cn(
                "panel absolute p-4 shadow-md",
                isVacation &&
                  "border-[3px] border-[var(--color-stage-done)] shadow-[0_0_0_4px_var(--color-stage-done-soft),0_4px_14px_rgba(23,27,33,0.15)]",
              )}
              style={{
                width: CARD_W,
                left: obj.x,
                top: obj.y,
                transform: `rotate(${obj.rotation}rad)`,
              }}
            >
              {isVacation ? (
                <>
                  <p className="text-sm font-semibold text-[var(--color-stage-done)]">🏖 Отпуск</p>
                  <p className="mt-1 text-xs text-[var(--color-ink-soft)]">Резать нельзя!</p>
                </>
              ) : (
                <>
                  <p className="truncate text-sm font-semibold tracking-tight">{obj.name}</p>
                  <div className="mt-3 flex items-center justify-between text-xs text-[var(--color-ink-soft)]">
                    <span className="font-mono">
                      {obj.done}/{obj.total} готово
                    </span>
                    <span className="font-mono">{pct}%</span>
                  </div>
                  <Progress value={pct} />
                </>
              )}
            </div>
          );
        })}

        {shards.map((s) => (
          <div
            key={s.id}
            className="animate-shard-fly panel absolute overflow-hidden p-4 shadow-md"
            style={
              {
                width: CARD_W / 2 - 4,
                left: s.x + (s.side === "left" ? 0 : CARD_W / 2 + 4),
                top: s.y,
                "--tx": `${s.tx}px`,
                "--ty": `${s.ty}px`,
                "--rot": `${s.rot}deg`,
              } as React.CSSProperties
            }
          >
            <p className="truncate text-sm font-semibold tracking-tight">
              {s.kind === "vacation" ? "🏖" : s.name}
            </p>
          </div>
        ))}

        {texts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-none absolute z-20 -translate-x-1/2 text-lg font-bold ${
              t.danger ? "text-[var(--color-danger)]" : "text-[var(--color-stage-done)]"
            }`}
            style={{ left: t.x, top: t.y }}
          >
            {t.text}
          </div>
        ))}

        {trail.length > 1 && (
          <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full">
            <polyline
              points={trail.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="white"
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.85}
            />
          </svg>
        )}

        {state !== "playing" && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/55 text-center text-white">
            {state === "ended" && (
              <div>
                <p className="text-sm text-white/70">
                  {vacationSlices >= MAX_VACATION_SLICES
                    ? `Порезано ${MAX_VACATION_SLICES} отпуска — игра окончена`
                    : "Игра окончена"}
                </p>
                <p className="text-3xl font-semibold">{score} очков</p>
              </div>
            )}
            {best !== null && <p className="text-sm text-white/60">Рекорд: {best}</p>}
            <div className="flex items-center gap-2">
              <Button onClick={startGame} size="lg">
                {state === "ended" ? <RotateCcw className="size-4" /> : <Flame className="size-4" />}
                {state === "ended" ? "Играть снова" : "Начать игру"}
              </Button>
              <Button variant="outline" size="lg" onClick={onExit}>
                <LogOut className="size-4" />
                Выйти
              </Button>
            </div>
            <p className="max-w-xs text-xs text-white/60">
              Зажмите мышь и проведите по доскам, чтобы разрезать их катаной.
              «Отпуск» (в зелёной рамке) резать нельзя — штраф −20, а после
              {" "}
              {MAX_VACATION_SLICES} порезанных отпусков игра закончится.
              Раунд без ограничения по времени.
            </p>
            <GameLeaderboard workspaceId={workspaceId} gameId="samurai" refreshKey={leaderboardKey} />
          </div>
        )}

        {paused && state === "playing" && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/55 text-center text-white">
            <p className="text-2xl font-semibold">Пауза</p>
            <Button onClick={togglePause} size="lg">
              <Play className="size-4" /> Продолжить
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
