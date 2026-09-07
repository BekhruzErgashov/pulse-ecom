"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, LogOut, Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GameLeaderboard } from "@/components/game-leaderboard";
import {
  AsapSprite,
  Cactus,
  ChatSprite,
  CountdownSprite,
  DeadlineSprite,
  MailSprite,
  MeetingSprite,
  ProblemSprite,
  ReportSprite,
  ReworkSprite,
  Runner,
  TasksSprite,
  type RunnerPose,
} from "@/components/dino-sprites";

type GroundKind = "deadline" | "pile" | "countdown" | "report" | "problem" | "rework";
type FlyKind = "mail" | "meeting" | "asap" | "chat";
type ObstacleKind = GroundKind | FlyKind;

interface ObstacleMeta {
  label: string;
  group: "ground" | "fly";
  Sprite: React.ComponentType;
}

const OBSTACLE_META: Record<ObstacleKind, ObstacleMeta> = {
  deadline: { label: "Дедлайн", group: "ground", Sprite: DeadlineSprite },
  pile: { label: "Гора задач", group: "ground", Sprite: TasksSprite },
  countdown: { label: "Обратный отсчёт", group: "ground", Sprite: CountdownSprite },
  report: { label: "Отчёт", group: "ground", Sprite: ReportSprite },
  problem: { label: "Неожиданная проблема", group: "ground", Sprite: ProblemSprite },
  rework: { label: "Переделки", group: "ground", Sprite: ReworkSprite },
  mail: { label: "Непрочитанные письма", group: "fly", Sprite: MailSprite },
  meeting: { label: "Срочное собрание", group: "fly", Sprite: MeetingSprite },
  asap: { label: "Срочный запрос", group: "fly", Sprite: AsapSprite },
  chat: { label: "Отвлекающие чаты", group: "fly", Sprite: ChatSprite },
};
const GROUND_KINDS: GroundKind[] = ["deadline", "pile", "countdown", "report", "problem", "rework"];
const FLY_KINDS: FlyKind[] = ["mail", "meeting", "asap", "chat"];

type FlyVariant = "duck" | "high";

interface Obstacle {
  id: number;
  kind: ObstacleKind;
  x: number;
  width: number;
  flyVariant?: FlyVariant;
}

// Геометрия столкновений — всё в пикселях, 0 = уровень земли.
const PLAYER_X = 64;
const PLAYER_W = 40;
const STAND_H = 72;
const DUCK_H = 34;
const GROUND_OBS_H = 58;
// Низкие летящие препятствия — нужно присесть (перекрывают рост стоя).
const FLY_DUCK_MIN = 44;
const FLY_DUCK_MAX = 96;
// Высокие летящие препятствия — пробегаются понизу без касания, прыгать под них не надо.
const FLY_HIGH_MIN = 78;
const FLY_HIGH_MAX = 118;

const GRAVITY = 0.6;
const JUMP_VELOCITY = 12.6;
// Скорость постоянная и умеренная на всю игру — раньше разгонялась от
// BASE_SPEED к MAX_SPEED, из-за чего каждый забег ощущался по-разному
// (то медленно в начале, то слишком быстро к концу).
const BASE_SPEED = 8;
const MAX_SPEED = 8;
const SPEED_ACCEL = 0;

// Пути к спрайтам персонажа и препятствий — используются, чтобы измерить
// РЕАЛЬНЫЕ пропорции (ширина/высота) каждой картинки. Раньше хитбоксы были
// фиксированного размера для всех кадров/препятствий, а картинки внутри
// вписывались через object-fit: contain — если пропорции картинки не
// совпадали с пропорциями бокса, персонаж/препятствие визуально
// «сжималось» с полями по краям, из-за чего казалось, что размер
// персонажа скачет между кадрами анимации, а хитбокс не совпадал с тем,
// что реально нарисовано. Теперь высота бокса фиксирована (для
// геймплея — прыжки/приседания рассчитаны на неё), а ширина считается
// строго по замеренной пропорции картинки — так бокс всегда совпадает
// с картинкой один в один, без пустых полей.
const CHARACTER_SRCS: Record<RunnerPose, string> = {
  idle: "/game/character/idle.png",
  run1: "/game/character/run1.png",
  run2: "/game/character/run2.png",
  run3: "/game/character/run3.png",
  run4: "/game/character/run4.png",
  jump1: "/game/character/jump1.png",
  jump2: "/game/character/jump2.png",
  jump3: "/game/character/jump3.png",
  jump4: "/game/character/jump4.png",
  jump5: "/game/character/jump5.png",
  duck1: "/game/character/duck1.png",
  duck2: "/game/character/duck2.png",
  duck3: "/game/character/duck3.png",
};

// Резервные пропорции (ширина/высота) — используются только до того, как
// реальная картинка успеет загрузиться и замериться; сняты с текущих
// файлов на момент правки, дальше пересчитываются динамически.
const CHARACTER_FALLBACK_RATIO: Record<RunnerPose, number> = {
  idle: 149 / 227,
  run1: 175 / 214,
  run2: 176 / 213,
  run3: 186 / 211,
  run4: 168 / 211,
  jump1: 168 / 171,
  jump2: 125 / 205,
  jump3: 101 / 166,
  jump4: 121 / 195,
  jump5: 187 / 158,
  duck1: 162 / 183,
  duck2: 158 / 147,
  duck3: 193 / 138,
};

const OBSTACLE_SRCS: Record<ObstacleKind, string> = {
  deadline: "/game/obstacles/deadline.png",
  pile: "/game/obstacles/pile.png",
  countdown: "/game/obstacles/countdown.png",
  report: "/game/obstacles/report.png",
  problem: "/game/obstacles/problem.png",
  rework: "/game/obstacles/rework.png",
  mail: "/game/obstacles/mail.png",
  meeting: "/game/obstacles/meeting.png",
  asap: "/game/obstacles/asap.png",
  chat: "/game/obstacles/chat.png",
};

const OBSTACLE_FALLBACK_RATIO: Record<ObstacleKind, number> = {
  deadline: 255 / 196,
  pile: 242 / 202,
  countdown: 227 / 185,
  report: 231 / 185,
  problem: 174 / 159,
  rework: 209 / 179,
  mail: 192 / 140,
  meeting: 127 / 232,
  asap: 178 / 160,
  chat: 173 / 137,
};

/** Замеряет реальные width/height картинок и отдаёт их соотношение (w/h). */
function useSpriteRatios<K extends string>(sources: Record<K, string>): Partial<Record<K, number>> {
  const [ratios, setRatios] = React.useState<Partial<Record<K, number>>>({});
  React.useEffect(() => {
    let cancelled = false;
    (Object.keys(sources) as K[]).forEach((key) => {
      const img = new window.Image();
      img.onload = () => {
        if (cancelled || !img.naturalWidth || !img.naturalHeight) return;
        setRatios((prev) => ({ ...prev, [key]: img.naturalWidth / img.naturalHeight }));
      };
      img.src = sources[key];
    });
    return () => {
      cancelled = true;
    };
    // Список источников статический (объявлен на уровне модуля) — намеренно
    // не перезапускаем эффект при каждом ререндере.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return ratios;
}

/** Целевая высота хитбокса препятствия — то, подо что рассчитан прыжок/присед. */
function obstacleTargetHeight(kind: ObstacleKind, flyVariant?: FlyVariant): number {
  if (OBSTACLE_META[kind].group !== "fly") return GROUND_OBS_H;
  return flyVariant === "high" ? FLY_HIGH_MAX - FLY_HIGH_MIN : FLY_DUCK_MAX - FLY_DUCK_MIN;
}

function overlaps(a1: number, a2: number, b1: number, b2: number) {
  return a1 < b2 && b1 < a2;
}

function pad(n: number) {
  return String(Math.max(0, Math.floor(n))).padStart(5, "0");
}

export function DinoGame({ workspaceId, onExit }: { workspaceId: string; onExit: () => void }) {
  const arenaRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState({ w: 900, h: 480 });
  const [state, setState] = React.useState<"idle" | "playing" | "ended">("idle");
  const [paused, setPaused] = React.useState(false);
  const [score, setScore] = React.useState(0);
  const [distance, setDistance] = React.useState(0);
  const [best, setBest] = React.useState<number | null>(null);
  const [leaderboardKey, setLeaderboardKey] = React.useState(0);
  const [obstacles, setObstacles] = React.useState<Obstacle[]>([]);
  const [yOffset, setYOffset] = React.useState(0);
  const [ducking, setDucking] = React.useState(false);
  const [runFrame, setRunFrame] = React.useState<0 | 1 | 2 | 3>(0);
  const [jumpFrame, setJumpFrame] = React.useState<1 | 2 | 3 | 4 | 5>(1);
  const [bgOffset, setBgOffset] = React.useState(0);

  const characterRatios = useSpriteRatios(CHARACTER_SRCS);
  const obstacleRatios = useSpriteRatios(OBSTACLE_SRCS);
  const obstacleRatiosRef = React.useRef(obstacleRatios);
  React.useEffect(() => {
    obstacleRatiosRef.current = obstacleRatios;
  }, [obstacleRatios]);

  const obstaclesRef = React.useRef<Obstacle[]>([]);
  const nextIdRef = React.useRef(0);
  const rafRef = React.useRef<number | null>(null);
  const gameIdRef = React.useRef(0);
  const runningRef = React.useRef(false);
  const pausedRef = React.useRef(false);
  const speedRef = React.useRef(BASE_SPEED);
  const distanceRef = React.useRef(0);
  const nextSpawnAtRef = React.useRef(310);
  const scoreRef = React.useRef(0);
  const yRef = React.useRef(0);
  const vyRef = React.useRef(0);
  const jumpingRef = React.useRef(false);
  const duckingRef = React.useRef(false);
  const runFrameRef = React.useRef<0 | 1 | 2 | 3>(0);
  const jumpFrameRef = React.useRef<1 | 2 | 3 | 4 | 5>(1);
  const frameTickRef = React.useRef(0);
  const bgOffsetRef = React.useRef(0);

  React.useEffect(() => {
    const stored = localStorage.getItem("ttt_dino_best");
    if (stored) setBest(Number(stored));
  }, []);

  React.useEffect(() => {
    function measure() {
      const el = arenaRef.current;
      if (el) setSize({ w: el.clientWidth, h: el.clientHeight });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  function pickObstacleKind(): ObstacleKind {
    const useFly = Math.random() < 0.38;
    const pool = useFly ? FLY_KINDS : GROUND_KINDS;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function spawnObstacle() {
    const w = arenaRef.current?.clientWidth ?? size.w;
    const kind = pickObstacleKind();
    const isFly = OBSTACLE_META[kind].group === "fly";
    const flyVariant: FlyVariant | undefined = isFly ? (Math.random() < 0.5 ? "duck" : "high") : undefined;
    const targetHeight = obstacleTargetHeight(kind, flyVariant);
    const ratio = obstacleRatiosRef.current[kind] ?? OBSTACLE_FALLBACK_RATIO[kind];
    const obs: Obstacle = {
      id: nextIdRef.current++,
      kind,
      x: w + 40,
      // Ширина считается по реальной пропорции картинки при фиксированной
      // (игровой) высоте — хитбокс совпадает с видимым спрайтом без полей.
      width: targetHeight * ratio,
      flyVariant,
    };
    obstaclesRef.current = [...obstaclesRef.current, obs];
  }

  function jump() {
    if (state !== "playing" || pausedRef.current) return;
    if (jumpingRef.current) return;
    duckingRef.current = false;
    setDucking(false);
    jumpingRef.current = true;
    vyRef.current = JUMP_VELOCITY;
    jumpFrameRef.current = 1;
    setJumpFrame(1);
  }

  function startDuck() {
    if (state !== "playing" || pausedRef.current) return;
    if (jumpingRef.current) return;
    duckingRef.current = true;
    setDucking(true);
  }

  function endDuck() {
    duckingRef.current = false;
    setDucking(false);
  }

  React.useEffect(() => {
    if (state !== "playing") return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        jump();
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        startDuck();
      }
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code === "ArrowDown") endDuck();
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function step(myGameId: number) {
    if (myGameId !== gameIdRef.current) return; // защита: старый цикл игры больше не актуален
    if (!runningRef.current) return;
    if (!pausedRef.current) {
      speedRef.current = Math.min(MAX_SPEED, speedRef.current + SPEED_ACCEL);
      const speed = speedRef.current;
      distanceRef.current += speed;
      scoreRef.current += speed * 0.08;
      setScore(Math.floor(scoreRef.current));
      setDistance(Math.floor(distanceRef.current / 10));

      bgOffsetRef.current += speed * 0.35;
      setBgOffset(bgOffsetRef.current);

      frameTickRef.current += 1;
      if (frameTickRef.current % 6 === 0) {
        runFrameRef.current = ((runFrameRef.current + 1) % 4) as 0 | 1 | 2 | 3;
        setRunFrame(runFrameRef.current);
      }

      if (jumpingRef.current) {
        yRef.current += vyRef.current;
        vyRef.current -= GRAVITY;
        const vy = vyRef.current;
        const jf: 1 | 2 | 3 | 4 | 5 = vy > 8 ? 1 : vy > 3 ? 2 : vy > -3 ? 3 : vy > -8 ? 4 : 5;
        if (jf !== jumpFrameRef.current) {
          jumpFrameRef.current = jf;
          setJumpFrame(jf);
        }
        if (yRef.current <= 0) {
          yRef.current = 0;
          vyRef.current = 0;
          jumpingRef.current = false;
        }
        setYOffset(yRef.current);
      }

      obstaclesRef.current = obstaclesRef.current
        .map((o) => ({ ...o, x: o.x - speed }))
        .filter((o) => o.x + o.width > -40);
      setObstacles(obstaclesRef.current);

      if (distanceRef.current >= nextSpawnAtRef.current) {
        spawnObstacle();
        // Расстояние между препятствиями — совсем немного увеличено
        // (было max(230, 380-speed*8) + rand*180) относительно прежней
        // версии, чтобы между прыжками/приседаниями было чуть больше
        // воздуха, не меняя ощущение игры целиком.
        const gap = Math.max(260, 420 - speed * 8) + Math.random() * 190;
        nextSpawnAtRef.current = distanceRef.current + gap;
      }

      const playerH = jumpingRef.current ? STAND_H : duckingRef.current ? DUCK_H : STAND_H;
      const playerBottom = yRef.current;
      const playerTop = yRef.current + playerH;

      for (const o of obstaclesRef.current) {
        if (!overlaps(o.x, o.x + o.width, PLAYER_X, PLAYER_X + PLAYER_W)) continue;
        const meta = OBSTACLE_META[o.kind];
        let obsBottom = 0;
        let obsTop = GROUND_OBS_H;
        if (meta.group === "fly") {
          if (o.flyVariant === "high") {
            obsBottom = FLY_HIGH_MIN;
            obsTop = FLY_HIGH_MAX;
          } else {
            obsBottom = FLY_DUCK_MIN;
            obsTop = FLY_DUCK_MAX;
          }
        }
        if (overlaps(playerBottom, playerTop, obsBottom, obsTop)) {
          finishGame();
          return; // игра завершена — не планируем следующий кадр
        }
      }
    }
    if (!runningRef.current || myGameId !== gameIdRef.current) return;
    rafRef.current = requestAnimationFrame(() => step(myGameId));
  }

  function resetGameState() {
    obstaclesRef.current = [];
    setObstacles([]);
    speedRef.current = BASE_SPEED;
    distanceRef.current = 0;
    nextSpawnAtRef.current = 280;
    scoreRef.current = 0;
    setScore(0);
    setDistance(0);
    yRef.current = 0;
    vyRef.current = 0;
    jumpingRef.current = false;
    duckingRef.current = false;
    runFrameRef.current = 0;
    jumpFrameRef.current = 1;
    frameTickRef.current = 0;
    setRunFrame(0);
    setJumpFrame(1);
    setYOffset(0);
    setDucking(false);
  }

  function startGame() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    gameIdRef.current += 1;
    const myGameId = gameIdRef.current;
    const el = arenaRef.current;
    if (el) setSize({ w: el.clientWidth, h: el.clientHeight });
    resetGameState();
    setState("playing");
    setPaused(false);
    pausedRef.current = false;
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(() => step(myGameId));
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
    const finalScore = Math.floor(scoreRef.current);
    setBest((prevBest) => {
      if (prevBest === null || finalScore > prevBest) {
        localStorage.setItem("ttt_dino_best", String(finalScore));
        return finalScore;
      }
      return prevBest;
    });
    // Отправляем результат в общую доску рекордов пространства — сохранится,
    // только если он выше уже сохранённого (см. upsertGameScore). Не ждём
    // ответа: если запрос не удался, просто не обновится общий рекорд,
    // локальный счёт всё равно посчитан выше.
    fetch("/api/games/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, gameId: "dino", score: finalScore }),
    })
      .then(() => setLeaderboardKey((k) => k + 1))
      .catch(() => {});
  }

  React.useEffect(() => {
    return () => {
      runningRef.current = false;
      gameIdRef.current += 1;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function handleArenaClick() {
    jump();
  }

  const runnerPose: RunnerPose = ducking
    ? "duck1"
    : yOffset > 0.5
      ? (`jump${jumpFrame}` as RunnerPose)
      : (`run${runFrame + 1}` as RunnerPose);

  // Высота бокса игрока фиксирована (от неё зависят прыжок/присед), а
  // ширина считается по реальной пропорции текущего кадра — иначе разные
  // кадры анимации (бег/прыжок/присед) сжимались бы по-разному внутри
  // одного фиксированного бокса и персонаж визуально «менял размер».
  const playerHeight = ducking ? DUCK_H : STAND_H;
  const playerRatio = characterRatios[runnerPose] ?? CHARACTER_FALLBACK_RATIO[runnerPose];
  const playerWidth = playerHeight * playerRatio;
  const playerLeft = PLAYER_X + PLAYER_W / 2 - playerWidth / 2;

  return (
    <div className="relative mt-8 flex-1">
      <div
        ref={arenaRef}
        onClick={handleArenaClick}
        className="relative aspect-[2172/820] max-h-[560px] w-full touch-none overflow-hidden rounded-(--radius-card) border border-[var(--color-line)] bg-[var(--color-paper)]"
      >
        {state === "playing" && (
          <div className="absolute right-3 top-3 z-30 flex gap-2" onClick={(e) => e.stopPropagation()}>
            <Button variant="outline" size="icon" onClick={togglePause} title={paused ? "Продолжить" : "Пауза"}>
              {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            </Button>
            <Button variant="outline" size="icon" onClick={startGame} title="Начать заново">
              <RotateCcw className="size-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={onExit} title="Выйти из игры">
              <LogOut className="size-4" />
            </Button>
          </div>
        )}

        {state === "playing" && (
          <div className="absolute left-4 top-3 z-30 flex items-center gap-3 font-mono text-xs uppercase tracking-widest text-[var(--color-ink)]">
            <span>HI {pad(best ?? 0)}</span>
            <span>{pad(score)}</span>
          </div>
        )}

        {state === "playing" && (
          <div className="absolute right-4 top-14 z-30 font-mono text-xs uppercase tracking-widest text-[var(--color-ink)]">
            <span>Distance {pad(distance)}</span>
          </div>
        )}

        {/* Фон: пустыня/скайлайн с параллаксом (реальная картинка, тайлится по горизонтали) */}
        <div
          className="absolute inset-x-0 bottom-0 top-0"
          style={{
            backgroundImage: "url(/game/background.png)",
            backgroundRepeat: "repeat-x",
            backgroundPosition: `${-(bgOffset % 2172)}px bottom`,
            backgroundSize: "auto 100%",
            opacity: 0.6,
          }}
        />

        {/* Линия земли со штрихами-делениями */}
        <div className="absolute inset-x-0 bottom-0">
          <div className="h-[2px] w-full bg-[var(--color-ink)]" />
          <div
            className="h-[4px] w-full"
            style={{
              backgroundImage:
                "repeating-linear-gradient(to right, var(--color-ink-soft) 0, var(--color-ink-soft) 2px, transparent 2px, transparent 16px)",
            }}
          />
        </div>

        {/* Игрок */}
        {state === "playing" && (
          <div
            className="absolute"
            style={{
              left: playerLeft,
              bottom: yOffset,
              width: playerWidth,
              height: playerHeight,
            }}
          >
            <Runner pose={runnerPose} />
          </div>
        )}

        {obstacles.map((o) => {
          const meta = OBSTACLE_META[o.kind];
          const { Sprite } = meta;
          const isFly = meta.group === "fly";
          const flyBottom = o.flyVariant === "high" ? FLY_HIGH_MIN : FLY_DUCK_MIN;
          const flyTop = o.flyVariant === "high" ? FLY_HIGH_MAX : FLY_DUCK_MAX;
          return (
            <div
              key={o.id}
              className="absolute"
              style={{
                left: o.x,
                bottom: isFly ? flyBottom : 0,
                width: o.width,
                height: isFly ? flyTop - flyBottom : GROUND_OBS_H,
                opacity: 1,
                filter: isFly ? undefined : "drop-shadow(0 2px 2px rgba(0,0,0,0.35))",
              }}
            >
              <Sprite />
            </div>
          );
        })}

        {state === "playing" && (
          <div className="absolute bottom-3 right-3 z-30 flex gap-2" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="outline"
              size="icon"
              onPointerDown={startDuck}
              onPointerUp={endDuck}
              onPointerLeave={endDuck}
              title="Присесть (ArrowDown)"
            >
              <ArrowDown className="size-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={jump} title="Прыжок (Space)">
              <ArrowUp className="size-4" />
            </Button>
          </div>
        )}

        {state !== "playing" && (
          <div
            className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[var(--color-paper)]/95 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            {state === "ended" ? (
              <div className="flex flex-col items-center gap-3 rounded-(--radius-card) border-2 border-[var(--color-ink)] bg-[var(--color-paper)] px-8 py-6">
                <p className="font-mono text-lg font-semibold uppercase tracking-widest text-[var(--color-ink)]">
                  Game over
                </p>
                <div className="flex h-14 items-end gap-3">
                  <div className="h-14 w-8">
                    <Runner pose="idle" />
                  </div>
                  <Cactus className="h-12 w-8 opacity-70" />
                </div>
                <p className="font-mono text-sm text-[var(--color-ink-soft)]">{pad(score)} очков</p>
              </div>
            ) : (
              <div className="h-20 w-9">
                <Runner pose="idle" />
              </div>
            )}
            {best !== null && <p className="font-mono text-xs text-[var(--color-ink-soft)]">Рекорд {pad(best)}</p>}
            <div className="flex items-center gap-2">
              <Button onClick={startGame} size="lg">
                <RotateCcw className="size-4" />
                {state === "ended" ? "Играть снова" : "Начать забег"}
              </Button>
              <Button variant="outline" size="lg" onClick={onExit}>
                <LogOut className="size-4" />
                Выйти
              </Button>
            </div>
            <p className="max-w-xs text-xs text-[var(--color-ink-soft)]">
              Пробел / стрелка вверх — прыжок через дедлайны и горы задач.
              Стрелка вниз — присесть под письмами и срочными созвонами.
            </p>
            <GameLeaderboard workspaceId={workspaceId} gameId="dino" refreshKey={leaderboardKey} />
          </div>
        )}

        {paused && state === "playing" && (
          <div
            className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-[var(--color-paper)]/95 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="font-mono text-2xl font-semibold uppercase tracking-widest text-[var(--color-ink)]">Пауза</p>
            <Button onClick={togglePause} size="lg">
              <Play className="size-4" /> Продолжить
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
