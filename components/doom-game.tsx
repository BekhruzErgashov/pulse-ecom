"use client";

import * as React from "react";
import { Heart, LogOut, Pause, Play, RotateCcw, Skull, Target, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { GameLeaderboard } from "@/components/game-leaderboard";

/**
 * «Отстрел задач» — мини-шутер от первого лица в стиле классических
 * рейкастеров (Wolfenstein 3D/Doom): плоская сетчатая карта, но за счёт
 * DDA-рейкастинга (по одному лучу на колонку экрана) она рисуется как
 * псевдо-3D коридоры. Это стандартная, много где описанная техника
 * компьютерной графики — не код и не ассеты какой-либо конкретной игры.
 * Внутренний рендер идёт на низком разрешении 320×200 (то самое разрешение
 * старых DOS-шутеров) в <canvas>, растянутом через CSS с
 * `image-rendering: pixelated` — это и производительнее, чем рендерить
 * посёлочно на реальном разрешении экрана, и даёт узнаваемую ретро-картинку.
 *
 * Второй раунд (визуальный апгрейд): пользователь прислал три больших
 * ассет-листа (офисный кит стен/полов, лист врагов-«офисных монстров» с
 * анимацией, лист рук с дробовиком/вспышками/декалями). Скрипт в песочнице
 * (`crop_assets.py`, numpy + scipy.ndimage) вырезал из них отдельные PNG:
 * связные тёмные области, касающиеся края кропа, считаются фоном и
 * становятся прозрачными (`ndimage.label` + проверка индексов на границе —
 * так тёмные детали самого спрайта, не касающиеся края, не выкалываются),
 * после чего изображение обрезается по фактическому alpha-bbox. Итоговые
 * файлы лежат в `public/game/shooter/*.png` и подгружаются здесь через
 * `new Image()` в эффекте на маунте (не в module scope — конструктор
 * `Image` — DOM API, при SSR модуль импортируется на сервере, где `Image`
 * не существует).
 */

// ---------- Ассеты ----------

const ASSET_BASE = "/game/shooter";
// `/game/:path*` отдаётся с `Cache-Control: immutable, max-age=1 год`
// (см. next.config.ts) — специально, чтобы спрайты не мигали на плохой
// сети. Обратная сторона: при замене содержимого файла под тем же именем
// браузер (и CDN) может продолжать показывать старую закэшированную
// картинку сколько угодно долго, никогда не перезапрашивая её. Поэтому
// при каждой замене ассетов версия ниже увеличивается — это меняет сам
// URL и гарантированно обходит кэш.
const ASSET_VERSION = "v3";

const ASSET_PATHS = {
  wallPlain: `${ASSET_BASE}/wall-plain.png?${ASSET_VERSION}`,
  wallDoor: `${ASSET_BASE}/wall-door.png?${ASSET_VERSION}`,
  wallWindow: `${ASSET_BASE}/wall-window.png?${ASSET_VERSION}`,
  wallWhiteboard: `${ASSET_BASE}/wall-whiteboard.png?${ASSET_VERSION}`,
  floorWood: `${ASSET_BASE}/floor-wood.png?${ASSET_VERSION}`,
  enemyClock: `${ASSET_BASE}/enemy-clock.png?${ASSET_VERSION}`,
  enemyPaper: `${ASSET_BASE}/enemy-paper.png?${ASSET_VERSION}`,
  enemyError: `${ASSET_BASE}/enemy-error.png?${ASSET_VERSION}`,
  enemyCoffee: `${ASSET_BASE}/enemy-coffee.png?${ASSET_VERSION}`,
  gunIdle: `${ASSET_BASE}/gun-idle.png?${ASSET_VERSION}`,
  gunFire: `${ASSET_BASE}/gun-fire.png?${ASSET_VERSION}`,
  muzzleFlash: `${ASSET_BASE}/muzzle-flash.png?${ASSET_VERSION}`,
  bulletHole: `${ASSET_BASE}/bullet-hole.png?${ASSET_VERSION}`,
  bloodSplat: `${ASSET_BASE}/blood-splat.png?${ASSET_VERSION}`,
} as const;

type AssetKey = keyof typeof ASSET_PATHS;
type AssetMap = Partial<Record<AssetKey, HTMLImageElement>>;

function isReady(img: HTMLImageElement | undefined): img is HTMLImageElement {
  return !!img && img.complete && img.naturalWidth > 0;
}

const ENEMY_KIND_COUNT = 4;
const ENEMY_IMG_KEYS: AssetKey[] = ["enemyClock", "enemyPaper", "enemyError", "enemyCoffee"];
const ENEMY_FALLBACK_GLYPH = ["⏰", "📄", "🖥️", "☕"];
const ENEMY_LABELS = ["Часодедлайн", "Бумажный монстр", "Системная ошибка", "Кофейный монстр"];

// ---------- Карта ----------

const MAP_SIZE = 16;

type Grid = number[][];

/** Цвет-фоллбэк для стены, пока текстура ещё не загрузилась (или не смогла). */
const WALL_FALLBACK: Record<number, { lit: string; shadow: string }> = {
  1: { lit: "#8a7a63", shadow: "#6d604d" },
  2: { lit: "#7a6550", shadow: "#5f4e3d" },
  3: { lit: "#4d6fb3", shadow: "#3a5589" },
  4: { lit: "#9aa0a8", shadow: "#787e85" },
};

/** Тип стены → ключ текстуры (см. ASSET_PATHS). */
const WALL_TEX_KEY: Record<number, AssetKey> = {
  1: "wallPlain",
  2: "wallDoor",
  3: "wallWindow",
  4: "wallWhiteboard",
};

/**
 * На сколько игровых клеток растягивается текстура по горизонтали, прежде
 * чем повториться (см. использование в render()). Обычная стена
 * («wallPlain») — длинный сплошной забор, который тянется на много клеток
 * подряд (весь периметр карты); если рисовать на ней целую фотографию
 * стены с тремя видимыми панелями на каждую отдельную клетку в 1 юнит
 * шириной, то при взгляде вдоль стены (а не строго перпендикулярно)
 * видно сразу много клеток подряд, и получается «частокол одинаковых
 * маленьких рамок» — ровно то, на что пожаловался пользователь
 * («промежутки все друг на друге»). Растягивая ту же текстуру на 3 клетки
 * вместо 1, повторов на экране в 3 раза меньше, и панели на фото
 * визуально совпадают по масштабу с шириной клетки. Дверь/окно/доска
 * сидят на одноклеточных колоннах (см. ниже) — там span=1 и есть ровно
 * одно изображение на всю видимую грань, без повторов и обрезков.
 */
const WALL_TEX_SPAN: Record<number, number> = {
  1: 3,
  2: 1,
  3: 1,
  4: 1,
};

/**
 * Открытый квадратный зал в кольце стен + до 5 колонн-«укрытий» внутри,
 * каждая появляется случайно (для разнообразия между заездами). Колонны
 * друг друга и границу не касаются, поэтому карта гарантированно связная —
 * без риска запертых зон, в отличие от рукописного ASCII-лабиринта.
 * Колонны — ровно 1×1 клетки (раньше были 2×2): дверь/окно/доска — это
 * одна цельная картинка на всю грань, а не узкий фрагмент, поэтому грань
 * должна быть шириной ровно в одну текстуру, иначе тот же рисунок либо
 * повторяется дважды на одной колонне, либо обрезается пополам.
 */
function buildMap(): Grid {
  const grid: Grid = Array.from({ length: MAP_SIZE }, () => Array<number>(MAP_SIZE).fill(1));
  for (let y = 1; y < MAP_SIZE - 1; y++) {
    for (let x = 1; x < MAP_SIZE - 1; x++) grid[y][x] = 0;
  }
  const pillars: { x: number; y: number; type: number }[] = [
    { x: 3, y: 3, type: 2 },
    { x: 11, y: 3, type: 3 },
    { x: 3, y: 11, type: 3 },
    { x: 11, y: 11, type: 2 },
    { x: 7, y: 7, type: 4 },
  ];
  for (const p of pillars) {
    if (Math.random() < 0.7) {
      grid[p.y][p.x] = p.type;
    }
  }
  return grid;
}

function isWallAt(grid: Grid, x: number, y: number): boolean {
  const gx = Math.floor(x);
  const gy = Math.floor(y);
  if (gx < 0 || gy < 0 || gx >= MAP_SIZE || gy >= MAP_SIZE) return true;
  return grid[gy][gx] > 0;
}

function randomFloorCell(grid: Grid, avoid?: { x: number; y: number; minDist: number }): { x: number; y: number } {
  for (let attempt = 0; attempt < 200; attempt++) {
    const x = 1.5 + Math.random() * (MAP_SIZE - 3);
    const y = 1.5 + Math.random() * (MAP_SIZE - 3);
    if (isWallAt(grid, x, y)) continue;
    if (avoid && Math.hypot(x - avoid.x, y - avoid.y) < avoid.minDist) continue;
    return { x, y };
  }
  return { x: MAP_SIZE / 2, y: MAP_SIZE / 2 };
}

function shadeColor(hex: string, amount: number): string {
  const num = parseInt(hex.slice(1), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const mix = (c: number) => Math.round(c * (1 - amount));
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}

// ---------- Рейкастинг (DDA, классическая техника — см. например Lodev raycasting tutorial) ----------

interface RayHit {
  dist: number;
  side: 0 | 1;
  wallType: number;
}

function castRay(grid: Grid, posX: number, posY: number, rayDirX: number, rayDirY: number): RayHit {
  let mapX = Math.floor(posX);
  let mapY = Math.floor(posY);
  const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
  const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);
  let stepX: number;
  let stepY: number;
  let sideDistX: number;
  let sideDistY: number;
  if (rayDirX < 0) {
    stepX = -1;
    sideDistX = (posX - mapX) * deltaDistX;
  } else {
    stepX = 1;
    sideDistX = (mapX + 1 - posX) * deltaDistX;
  }
  if (rayDirY < 0) {
    stepY = -1;
    sideDistY = (posY - mapY) * deltaDistY;
  } else {
    stepY = 1;
    sideDistY = (mapY + 1 - posY) * deltaDistY;
  }
  let side: 0 | 1 = 0;
  let wallType = 1;
  for (let i = 0; i < 128; i++) {
    if (sideDistX < sideDistY) {
      sideDistX += deltaDistX;
      mapX += stepX;
      side = 0;
    } else {
      sideDistY += deltaDistY;
      mapY += stepY;
      side = 1;
    }
    if (mapX < 0 || mapY < 0 || mapX >= MAP_SIZE || mapY >= MAP_SIZE) {
      wallType = 1;
      break;
    }
    if (grid[mapY][mapX] > 0) {
      wallType = grid[mapY][mapX];
      break;
    }
  }
  const perpWallDist = side === 0 ? sideDistX - deltaDistX : sideDistY - deltaDistY;
  return { dist: Math.max(0.05, perpWallDist), side, wallType };
}

// ---------- Константы игры ----------

const NUM_RAYS = 320;
const VIEW_H = 200;
const FOV = (66 * Math.PI) / 180;
const PLANE_SCALE = Math.tan(FOV / 2);

const MOVE_SPEED = 3.1; // клеток/сек
const ARROW_ROT_SPEED = 2.3; // рад/сек — поворот стрелками для тех, кто не берёт мышь
const MOUSE_SENSITIVITY = 0.0022;
const WALL_MARGIN = 0.2; // не даёт камере вплотную влипнуть в стену

const FIRE_COOLDOWN_MS = 260;
const SHOT_RANGE = 14;
const SHOT_ANGLE_TOLERANCE = 0.09;
const MUZZLE_FLASH_MS = 100;
const HIT_FLASH_MS = 220;
const DAMAGE_FLASH_MS = 260;

const ENEMY_SPEED = 1.15; // клеток/сек
const ENEMY_DETECT_RADIUS = 7.5;
const ENEMY_BITE_RANGE = 0.65;
const ENEMY_BITE_DAMAGE = 8;
const ENEMY_BITE_COOLDOWN_MS = 900;
const ENEMY_MAX_HP = 2;

const COFFEE_HEAL = 30;
const PLAYER_MAX_HP = 100;
const NEXT_WAVE_DELAY_MS = 1500;

/** Очки — за побеждённых монстров и за выживание в волнах (не только за
 * убийства, иначе фарм одной волны без прогресса был бы оптимальной
 * стратегией). Общая функция для HUD-счётчика во время игры, финального
 * экрана и отправки на доску рекордов — чтобы не разошлись 3 копии
 * одной и той же формулы. */
function computeScore(kills: number, wave: number): number {
  return kills * 10 + (wave - 1) * 25;
}

interface Enemy {
  id: number;
  x: number;
  y: number;
  hp: number;
  kind: number;
  biteCooldown: number;
}

interface Pickup {
  id: number;
  x: number;
  y: number;
}

export function DoomGame({ workspaceId, onExit }: { workspaceId: string; onExit: () => void }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const minimapRef = React.useRef<HTMLCanvasElement>(null);

  const [state, setState] = React.useState<"idle" | "playing" | "ended">("idle");
  const [paused, setPaused] = React.useState(false);
  const [health, setHealth] = React.useState(PLAYER_MAX_HP);
  const [kills, setKills] = React.useState(0);
  const [wave, setWave] = React.useState(1);
  const [best, setBest] = React.useState<number | null>(null);
  const [leaderboardKey, setLeaderboardKey] = React.useState(0);
  const [pointerLocked, setPointerLocked] = React.useState(false);

  const assetsRef = React.useRef<AssetMap>({});
  const floorPatternRef = React.useRef<CanvasPattern | null>(null);

  const gridRef = React.useRef<Grid>([]);
  const posRef = React.useRef({ x: 2.5, y: 2.5 });
  const angleRef = React.useRef(0);
  const enemiesRef = React.useRef<Enemy[]>([]);
  const pickupsRef = React.useRef<Pickup[]>([]);
  const keysRef = React.useRef<Set<string>>(new Set());
  const mouseDxRef = React.useRef(0);
  const healthRef = React.useRef(PLAYER_MAX_HP);
  const killsRef = React.useRef(0);
  const waveRef = React.useRef(1);
  const nextWaveDelayRef = React.useRef(-1);
  const nextIdRef = React.useRef(0);
  const fireCooldownRef = React.useRef(0);
  const recoilRef = React.useRef(0);
  const muzzleTimerRef = React.useRef(0);
  const hitFlashRef = React.useRef(0);
  const missFlashRef = React.useRef(0);
  const damageFlashRef = React.useRef(0);
  const zbufferRef = React.useRef<number[]>(new Array(NUM_RAYS).fill(1e30));
  const rafRef = React.useRef<number | null>(null);
  const runningRef = React.useRef(false);
  const pausedRef = React.useRef(false);
  const lastTsRef = React.useRef(0);

  React.useEffect(() => {
    const stored = localStorage.getItem("ttt_doom_best");
    if (stored) setBest(Number(stored));
  }, []);

  // Предзагрузка спрайтов — на маунте, а не в module scope: `Image` это DOM
  // API, которого нет при серверном рендере компонента.
  React.useEffect(() => {
    (Object.keys(ASSET_PATHS) as AssetKey[]).forEach((key) => {
      const img = new window.Image();
      img.src = ASSET_PATHS[key];
      assetsRef.current[key] = img;
    });
  }, []);

  function exitPointerLockIfNeeded() {
    if (document.pointerLockElement === canvasRef.current) {
      document.exitPointerLock();
    }
  }

  function spawnWave(n: number) {
    const grid = gridRef.current;
    const count = 2 + n;
    const spawned: Enemy[] = [];
    for (let i = 0; i < count; i++) {
      const cell = randomFloorCell(grid, { x: posRef.current.x, y: posRef.current.y, minDist: 3.5 });
      spawned.push({
        id: nextIdRef.current++,
        x: cell.x,
        y: cell.y,
        hp: ENEMY_MAX_HP,
        kind: Math.floor(Math.random() * ENEMY_KIND_COUNT),
        biteCooldown: 0,
      });
    }
    enemiesRef.current = [...enemiesRef.current, ...spawned];
  }

  function resetGameState() {
    const grid = buildMap();
    gridRef.current = grid;
    const start = { x: 2.5, y: 2.5 };
    posRef.current = start;
    angleRef.current = Math.atan2(MAP_SIZE / 2 - start.y, MAP_SIZE / 2 - start.x);
    enemiesRef.current = [];
    keysRef.current = new Set();
    mouseDxRef.current = 0;
    healthRef.current = PLAYER_MAX_HP;
    killsRef.current = 0;
    waveRef.current = 1;
    nextWaveDelayRef.current = -1;
    fireCooldownRef.current = 0;
    recoilRef.current = 0;
    muzzleTimerRef.current = 0;
    hitFlashRef.current = 0;
    missFlashRef.current = 0;
    damageFlashRef.current = 0;
    nextIdRef.current = 0;
    setHealth(PLAYER_MAX_HP);
    setKills(0);
    setWave(1);
    spawnWave(1);

    const pickups: Pickup[] = [];
    for (let i = 0; i < 3; i++) {
      const cell = randomFloorCell(grid, { x: start.x, y: start.y, minDist: 3 });
      pickups.push({ id: nextIdRef.current++, x: cell.x, y: cell.y });
    }
    pickupsRef.current = pickups;
  }

  function updatePlayer(dt: number) {
    const grid = gridRef.current;
    let angle = angleRef.current + mouseDxRef.current * MOUSE_SENSITIVITY;
    mouseDxRef.current = 0;
    const keys = keysRef.current;
    if (keys.has("ArrowLeft")) angle -= ARROW_ROT_SPEED * dt;
    if (keys.has("ArrowRight")) angle += ARROW_ROT_SPEED * dt;
    angleRef.current = angle;

    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const strafeX = -dirY;
    const strafeY = dirX;

    let moveX = 0;
    let moveY = 0;
    if (keys.has("KeyW") || keys.has("ArrowUp")) {
      moveX += dirX;
      moveY += dirY;
    }
    if (keys.has("KeyS") || keys.has("ArrowDown")) {
      moveX -= dirX;
      moveY -= dirY;
    }
    if (keys.has("KeyD")) {
      moveX += strafeX;
      moveY += strafeY;
    }
    if (keys.has("KeyA")) {
      moveX -= strafeX;
      moveY -= strafeY;
    }

    const len = Math.hypot(moveX, moveY);
    if (len > 0) {
      moveX /= len;
      moveY /= len;
      const speed = MOVE_SPEED * dt;
      const pos = posRef.current;
      const tryX = pos.x + moveX * speed;
      const tryY = pos.y + moveY * speed;
      const marginX = Math.sign(moveX) * WALL_MARGIN;
      const marginY = Math.sign(moveY) * WALL_MARGIN;
      if (!isWallAt(grid, tryX + marginX, pos.y)) pos.x = tryX;
      if (!isWallAt(grid, pos.x, tryY + marginY)) pos.y = tryY;
    }

    if (recoilRef.current > 0) recoilRef.current = Math.max(0, recoilRef.current - dt * 40);
  }

  function updateEnemies(dt: number) {
    const grid = gridRef.current;
    const pos = posRef.current;
    let damage = 0;
    for (const enemy of enemiesRef.current) {
      if (enemy.biteCooldown > 0) enemy.biteCooldown -= dt * 1000;
      const dx = pos.x - enemy.x;
      const dy = pos.y - enemy.y;
      const dist = Math.hypot(dx, dy);
      if (dist < ENEMY_BITE_RANGE) {
        if (enemy.biteCooldown <= 0) {
          damage += ENEMY_BITE_DAMAGE;
          enemy.biteCooldown = ENEMY_BITE_COOLDOWN_MS;
        }
      } else if (dist < ENEMY_DETECT_RADIUS) {
        const nx = dx / dist;
        const ny = dy / dist;
        const speed = ENEMY_SPEED * dt;
        const tryX = enemy.x + nx * speed;
        const tryY = enemy.y + ny * speed;
        if (!isWallAt(grid, tryX, enemy.y)) enemy.x = tryX;
        if (!isWallAt(grid, enemy.x, tryY)) enemy.y = tryY;
      }
    }
    if (damage > 0) {
      healthRef.current = Math.max(0, healthRef.current - damage);
      setHealth(healthRef.current);
      damageFlashRef.current = DAMAGE_FLASH_MS;
      if (healthRef.current <= 0) finishGame();
    }
  }

  function updatePickups() {
    const pos = posRef.current;
    let healed = 0;
    const remaining: Pickup[] = [];
    for (const p of pickupsRef.current) {
      if (Math.hypot(pos.x - p.x, pos.y - p.y) < 0.5) {
        healed += COFFEE_HEAL;
      } else {
        remaining.push(p);
      }
    }
    if (healed > 0) {
      pickupsRef.current = remaining;
      healthRef.current = Math.min(PLAYER_MAX_HP, healthRef.current + healed);
      setHealth(healthRef.current);
    }
  }

  function checkWaveComplete(dt: number) {
    if (enemiesRef.current.length > 0) {
      nextWaveDelayRef.current = -1;
      return;
    }
    if (nextWaveDelayRef.current < 0) {
      nextWaveDelayRef.current = NEXT_WAVE_DELAY_MS;
      return;
    }
    nextWaveDelayRef.current -= dt * 1000;
    if (nextWaveDelayRef.current <= 0) {
      waveRef.current += 1;
      setWave(waveRef.current);
      spawnWave(waveRef.current);
      nextWaveDelayRef.current = -1;
    }
  }

  function fire() {
    if (!runningRef.current || pausedRef.current) return;
    if (fireCooldownRef.current > 0) return;
    fireCooldownRef.current = FIRE_COOLDOWN_MS;
    recoilRef.current = 8;
    muzzleTimerRef.current = MUZZLE_FLASH_MS;

    const grid = gridRef.current;
    const pos = posRef.current;
    const angle = angleRef.current;
    const wallHit = castRay(grid, pos.x, pos.y, Math.cos(angle), Math.sin(angle));

    let target: Enemy | null = null;
    let targetDist = Math.min(SHOT_RANGE, wallHit.dist);
    for (const enemy of enemiesRef.current) {
      const dx = enemy.x - pos.x;
      const dy = enemy.y - pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist > targetDist) continue;
      let diff = Math.atan2(dy, dx) - angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) > SHOT_ANGLE_TOLERANCE) continue;
      targetDist = dist;
      target = enemy;
    }

    if (target) {
      target.hp -= 1;
      hitFlashRef.current = HIT_FLASH_MS;
      if (target.hp <= 0) {
        const deadId = target.id;
        enemiesRef.current = enemiesRef.current.filter((e) => e.id !== deadId);
        killsRef.current += 1;
        setKills(killsRef.current);
      }
    } else {
      missFlashRef.current = HIT_FLASH_MS;
    }
  }

  function drawGun(ctx: CanvasRenderingContext2D) {
    const kick = recoilRef.current;
    const firing = muzzleTimerRef.current > 0;
    const gunImg = firing ? assetsRef.current.gunFire : assetsRef.current.gunIdle;
    if (isReady(gunImg)) {
      const w = 190;
      const h = w * (gunImg.naturalHeight / gunImg.naturalWidth);
      const gx = NUM_RAYS / 2 - w * 0.46;
      const gy = VIEW_H - h * 0.62 + kick * 0.5;
      ctx.drawImage(gunImg, gx, gy, w, h);
      if (firing) {
        const flash = assetsRef.current.muzzleFlash;
        if (isReady(flash)) {
          const fw = 46;
          const fh = fw * (flash.naturalHeight / flash.naturalWidth);
          ctx.globalAlpha = Math.max(0, Math.min(1, muzzleTimerRef.current / MUZZLE_FLASH_MS));
          ctx.drawImage(flash, gx + w * 0.58, gy - fh * 0.3, fw, fh);
          ctx.globalAlpha = 1;
        }
      }
    } else {
      // Фоллбэк, пока картинка ещё грузится — упрощённый силуэт ружья.
      const gunW = 70;
      const gunH = 46;
      const gx = NUM_RAYS / 2 - gunW / 2;
      const gy = VIEW_H - gunH + 14 + kick * 0.4;
      ctx.fillStyle = "#2a2d33";
      ctx.fillRect(gx, gy, gunW, gunH);
    }
  }

  function drawDecalFlash(
    ctx: CanvasRenderingContext2D,
    img: HTMLImageElement | undefined,
    timer: number,
    maxMs: number,
    size: number,
  ) {
    if (timer <= 0 || !isReady(img)) return;
    const w = size;
    const h = size * (img.naturalHeight / img.naturalWidth);
    ctx.globalAlpha = Math.max(0, Math.min(1, timer / maxMs));
    ctx.drawImage(img, NUM_RAYS / 2 - w / 2, VIEW_H / 2 - h / 2, w, h);
    ctx.globalAlpha = 1;
  }

  function render() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const grid = gridRef.current;
    const pos = posRef.current;
    const angle = angleRef.current;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    const planeX = -dirY * PLANE_SCALE;
    const planeY = dirX * PLANE_SCALE;
    const assets = assetsRef.current;

    // Потолок — плоский градиент (офисный подвесной потолок).
    const ceilGrad = ctx.createLinearGradient(0, 0, 0, VIEW_H / 2);
    ceilGrad.addColorStop(0, "#e7e9ed");
    ceilGrad.addColorStop(1, "#a9afb8");
    ctx.fillStyle = ceilGrad;
    ctx.fillRect(0, 0, NUM_RAYS, VIEW_H / 2);

    // Пол — тайл реального паркета (не honestly perspective-correct floor
    // casting, а замощённый паттерн + затемнение к горизонту: сильно
    // дешевле по кадру, чем честный per-pixel пол, и всё равно выглядит
    // на порядок лучше плоской заливки.
    const floorImg = assets.floorWood;
    if (isReady(floorImg)) {
      if (!floorPatternRef.current) {
        floorPatternRef.current = ctx.createPattern(floorImg, "repeat");
      }
      if (floorPatternRef.current) {
        ctx.fillStyle = floorPatternRef.current;
        ctx.fillRect(0, VIEW_H / 2, NUM_RAYS, VIEW_H / 2);
      }
    } else {
      ctx.fillStyle = "#3b3f45";
      ctx.fillRect(0, VIEW_H / 2, NUM_RAYS, VIEW_H / 2);
    }
    const floorFog = ctx.createLinearGradient(0, VIEW_H / 2, 0, VIEW_H);
    floorFog.addColorStop(0, "rgba(18,18,22,0.72)");
    floorFog.addColorStop(1, "rgba(18,18,22,0.08)");
    ctx.fillStyle = floorFog;
    ctx.fillRect(0, VIEW_H / 2, NUM_RAYS, VIEW_H / 2);

    const zbuffer = zbufferRef.current;
    for (let x = 0; x < NUM_RAYS; x++) {
      const cameraX = (2 * x) / NUM_RAYS - 1;
      const rayDirX = dirX + planeX * cameraX;
      const rayDirY = dirY + planeY * cameraX;
      const hit = castRay(grid, pos.x, pos.y, rayDirX, rayDirY);
      zbuffer[x] = hit.dist;
      const lineHeight = Math.floor(VIEW_H / hit.dist);
      const drawStart = Math.max(0, Math.floor(-lineHeight / 2 + VIEW_H / 2));
      const drawEnd = Math.min(VIEW_H - 1, Math.floor(lineHeight / 2 + VIEW_H / 2));
      const sliceH = drawEnd - drawStart + 1;
      if (sliceH <= 0) continue;

      const texKey = WALL_TEX_KEY[hit.wallType] ?? "wallPlain";
      const texImg = assets[texKey];
      const shade = Math.min(0.78, (hit.side === 1 ? 0.3 : 0) + hit.dist / 17);

      if (isReady(texImg)) {
        const span = WALL_TEX_SPAN[hit.wallType] ?? 1;
        let wallX = (hit.side === 0 ? pos.y + hit.dist * rayDirY : pos.x + hit.dist * rayDirX) / span;
        wallX -= Math.floor(wallX);
        let texX = Math.floor(wallX * texImg.naturalWidth);
        if (hit.side === 0 && rayDirX > 0) texX = texImg.naturalWidth - texX - 1;
        if (hit.side === 1 && rayDirY < 0) texX = texImg.naturalWidth - texX - 1;
        texX = Math.max(0, Math.min(texImg.naturalWidth - 1, texX));
        ctx.drawImage(texImg, texX, 0, 1, texImg.naturalHeight, x, drawStart, 1, sliceH);
        ctx.fillStyle = `rgba(8,8,10,${shade})`;
        ctx.fillRect(x, drawStart, 1, sliceH);
      } else {
        const fallback = WALL_FALLBACK[hit.wallType] ?? WALL_FALLBACK[1];
        const base = hit.side === 1 ? fallback.shadow : fallback.lit;
        ctx.fillStyle = shadeColor(base, Math.min(0.55, hit.dist / 16));
        ctx.fillRect(x, drawStart, 1, sliceH);
      }
    }

    interface Billboard {
      x: number;
      y: number;
      kind: "enemy" | "pickup";
      enemyKind: number;
    }
    const billboards: Billboard[] = [
      ...enemiesRef.current.map((e) => ({ x: e.x, y: e.y, kind: "enemy" as const, enemyKind: e.kind })),
      ...pickupsRef.current.map((p) => ({ x: p.x, y: p.y, kind: "pickup" as const, enemyKind: 0 })),
    ];
    const invDet = 1 / (planeX * dirY - dirX * planeY);
    const projected = billboards
      .map((b) => {
        const spriteX = b.x - pos.x;
        const spriteY = b.y - pos.y;
        const transformX = invDet * (dirY * spriteX - dirX * spriteY);
        const transformY = invDet * (-planeY * spriteX + planeX * spriteY);
        return { ...b, transformX, transformY };
      })
      .filter((b) => b.transformY > 0.15)
      .sort((a, b) => b.transformY - a.transformY);

    for (const b of projected) {
      const screenX = Math.floor((NUM_RAYS / 2) * (1 + b.transformX / b.transformY));
      const col = Math.max(0, Math.min(NUM_RAYS - 1, screenX));
      if (b.transformY >= zbuffer[col]) continue;

      if (b.kind === "pickup") {
        const spriteHeight = Math.max(2, Math.abs(Math.floor((VIEW_H / b.transformY) * 0.7)));
        ctx.font = `${spriteHeight}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("☕", screenX, VIEW_H / 2 + spriteHeight * 0.02);
        continue;
      }

      const img = assets[ENEMY_IMG_KEYS[b.enemyKind]];
      const spriteHeight = Math.max(4, Math.abs(Math.floor(VIEW_H / b.transformY)));
      if (isReady(img)) {
        const spriteWidth = spriteHeight * (img.naturalWidth / img.naturalHeight);
        const top = VIEW_H / 2 - spriteHeight / 2;
        const fog = Math.min(0.5, b.transformY / 16);
        // Затемнение по дальности — через canvas-фильтр `brightness()` на
        // самом drawImage, а не отдельным fillRect поверх спрайта:
        // fillRect заливает весь прямоугольник целиком, включая прозрачные
        // углы PNG (спрайт ведь не квадратный), из-за чего вокруг врага
        // был виден лишний тёмный полупрозрачный квадрат. `filter`
        // применяется только к уже нарисованным (непрозрачным) пикселям
        // этого конкретного вызова, поэтому фон вокруг силуэта не трогает.
        if (fog > 0.02) ctx.filter = `brightness(${Math.max(0.35, 1 - fog)})`;
        ctx.drawImage(img, screenX - spriteWidth / 2, top, spriteWidth, spriteHeight);
        if (fog > 0.02) ctx.filter = "none";
      } else {
        ctx.font = `${spriteHeight}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ENEMY_FALLBACK_GLYPH[b.enemyKind], screenX, VIEW_H / 2 + spriteHeight * 0.02);
      }
    }

    // Красная виньетка при получении урона — дешёвая, но эффектная обратная связь.
    if (damageFlashRef.current > 0) {
      const alpha = Math.min(0.55, (damageFlashRef.current / DAMAGE_FLASH_MS) * 0.55);
      const vignette = ctx.createRadialGradient(
        NUM_RAYS / 2,
        VIEW_H / 2,
        VIEW_H * 0.25,
        NUM_RAYS / 2,
        VIEW_H / 2,
        VIEW_H * 0.75,
      );
      vignette.addColorStop(0, "rgba(180,0,0,0)");
      vignette.addColorStop(1, `rgba(160,0,0,${alpha})`);
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, NUM_RAYS, VIEW_H);
    }

    drawDecalFlash(ctx, assets.bloodSplat, hitFlashRef.current, HIT_FLASH_MS, 60);
    drawDecalFlash(ctx, assets.bulletHole, missFlashRef.current, HIT_FLASH_MS, 46);

    drawGun(ctx);

    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1;
    const cx = NUM_RAYS / 2;
    const cy = VIEW_H / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy);
    ctx.lineTo(cx - 2, cy);
    ctx.moveTo(cx + 2, cy);
    ctx.lineTo(cx + 5, cy);
    ctx.moveTo(cx, cy - 5);
    ctx.lineTo(cx, cy - 2);
    ctx.moveTo(cx, cy + 2);
    ctx.lineTo(cx, cy + 5);
    ctx.stroke();
  }

  function drawMinimap() {
    const canvas = minimapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const grid = gridRef.current;
    if (grid.length === 0) return;
    const cell = canvas.width / MAP_SIZE;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(23,27,33,0.55)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        if (grid[y][x] > 0) {
          ctx.fillStyle = "rgba(255,255,255,0.55)";
          ctx.fillRect(x * cell, y * cell, cell, cell);
        }
      }
    }
    for (const e of enemiesRef.current) {
      ctx.fillStyle = "#e8420c";
      ctx.beginPath();
      ctx.arc(e.x * cell, e.y * cell, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    const pos = posRef.current;
    const angle = angleRef.current;
    ctx.fillStyle = "#2e9e6c";
    ctx.beginPath();
    ctx.arc(pos.x * cell, pos.y * cell, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#2e9e6c";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(pos.x * cell, pos.y * cell);
    ctx.lineTo(pos.x * cell + Math.cos(angle) * 8, pos.y * cell + Math.sin(angle) * 8);
    ctx.stroke();
  }

  function step(ts: number) {
    if (!runningRef.current) return;
    const dt = Math.min(0.05, (ts - lastTsRef.current) / 1000);
    lastTsRef.current = ts;
    const dtMs = dt * 1000;

    if (!pausedRef.current) {
      updatePlayer(dt);
      updateEnemies(dt);
      updatePickups();
      checkWaveComplete(dt);
      if (fireCooldownRef.current > 0) fireCooldownRef.current -= dtMs;
      if (muzzleTimerRef.current > 0) muzzleTimerRef.current -= dtMs;
      if (hitFlashRef.current > 0) hitFlashRef.current -= dtMs;
      if (missFlashRef.current > 0) missFlashRef.current -= dtMs;
      if (damageFlashRef.current > 0) damageFlashRef.current -= dtMs;
    }

    render();
    drawMinimap();

    if (runningRef.current) rafRef.current = requestAnimationFrame(step);
  }

  function startGame() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    resetGameState();
    setState("playing");
    setPaused(false);
    pausedRef.current = false;
    runningRef.current = true;
    // eslint-disable-next-line react-hooks/purity -- инициализация игрового цикла, не рендер
    lastTsRef.current = performance.now();
    rafRef.current = requestAnimationFrame(step);
  }

  function togglePause() {
    setPaused((prev) => {
      const next = !prev;
      pausedRef.current = next;
      if (next) exitPointerLockIfNeeded();
      return next;
    });
  }

  function finishGame() {
    runningRef.current = false;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    exitPointerLockIfNeeded();
    setState("ended");
    const finalScore = computeScore(killsRef.current, waveRef.current);
    setBest((prevBest) => {
      if (prevBest === null || finalScore > prevBest) {
        localStorage.setItem("ttt_doom_best", String(finalScore));
        return finalScore;
      }
      return prevBest;
    });
    fetch("/api/games/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, gameId: "doom", score: finalScore }),
    })
      .then(() => setLeaderboardKey((k) => k + 1))
      .catch(() => {});
  }

  function handleCanvasClick() {
    if (state !== "playing" || paused) return;
    if (document.pointerLockElement !== canvasRef.current) {
      canvasRef.current?.requestPointerLock();
    } else {
      fire();
    }
  }

  React.useEffect(() => {
    if (state !== "playing") return;
    function onKeyDown(e: KeyboardEvent) {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === "Escape") {
        // Браузер и так снимает pointer lock по Esc (это его собственное
        // поведение, отменить нельзя), но раньше игра при этом не
        // ставилась на паузу — она продолжала идти за невидимым курсором,
        // и чтобы дотянуться до кнопок паузы/рестарта/выхода, приходилось
        // сначала кликать по канвасу, а это тут же захватывало указатель
        // обратно. Явный тоггл паузы по Esc даёт то же самое, что и клик
        // по кнопке паузы — курсор остаётся свободным, оверлей с крупной
        // «Продолжить» (и верхний ряд кнопок) сразу доступны.
        togglePause();
        return;
      }
      keysRef.current.add(e.code);
      if (e.code === "Space") fire();
    }
    function onKeyUp(e: KeyboardEvent) {
      keysRef.current.delete(e.code);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      keysRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  React.useEffect(() => {
    function onPointerLockChange() {
      setPointerLocked(document.pointerLockElement === canvasRef.current);
    }
    function onMouseMove(e: MouseEvent) {
      if (document.pointerLockElement !== canvasRef.current) return;
      mouseDxRef.current += e.movementX;
    }
    document.addEventListener("pointerlockchange", onPointerLockChange);
    document.addEventListener("mousemove", onMouseMove);
    return () => {
      document.removeEventListener("pointerlockchange", onPointerLockChange);
      document.removeEventListener("mousemove", onMouseMove);
    };
  }, []);

  React.useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      exitPointerLockIfNeeded();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative mt-8 flex-1">
      <div className="relative aspect-[8/5] max-h-[560px] w-full touch-none select-none overflow-hidden rounded-(--radius-card) border border-[var(--color-line)] bg-black">
        <canvas
          ref={canvasRef}
          width={NUM_RAYS}
          height={VIEW_H}
          onClick={handleCanvasClick}
          className="absolute inset-0 h-full w-full cursor-crosshair"
          style={{ imageRendering: "pixelated" }}
        />

        {state === "playing" && (
          <>
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

            <div className="absolute left-3 top-3 z-30 flex w-48 flex-col gap-1.5 rounded-(--radius-card) bg-[var(--color-paper-raised)]/90 px-3 py-2 shadow-sm backdrop-blur">
              <div className="flex items-center gap-1.5 text-xs font-mono">
                <Heart className="size-3.5 shrink-0 text-[var(--color-danger)]" />
                <Progress value={health} colorVar="var(--color-danger)" className="flex-1" />
                <span className="w-7 shrink-0 text-right">{health}</span>
              </div>
              <div className="flex items-center justify-between font-mono text-[11px] text-[var(--color-ink-soft)]">
                <span className="flex items-center gap-1">
                  <Skull className="size-3" /> {kills}
                </span>
                <span>Волна {wave}</span>
              </div>
              <div className="flex items-center justify-between border-t border-[var(--color-line)] pt-1 font-mono text-[11px]">
                <span className="text-[var(--color-ink-soft)]">Очки</span>
                <span className="font-semibold text-[var(--color-ink)]">{computeScore(kills, wave)}</span>
              </div>
            </div>

            <canvas
              ref={minimapRef}
              width={96}
              height={96}
              className="absolute bottom-3 right-3 z-30 rounded-(--radius-control) border border-white/30"
            />

            {!pointerLocked && !paused && (
              <div className="pointer-events-none absolute inset-x-0 top-16 z-30 flex justify-center">
                <p className="rounded-full bg-black/60 px-3 py-1 text-xs text-white">
                  Кликните по экрану, чтобы взять управление мышью
                </p>
              </div>
            )}
          </>
        )}

        {state !== "playing" && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-black/75 text-center text-white">
            {state === "ended" && (
              <div>
                <p className="text-sm text-white/70">
                  {health <= 0 ? "Вас доконали офисные монстры — игра окончена" : "Игра окончена"}
                </p>
                <p className="text-2xl font-semibold">{computeScore(kills, wave)} очков</p>
                <p className="text-sm text-white/70">
                  {kills} побеждено · волна {wave}
                </p>
              </div>
            )}
            {best !== null && <p className="text-sm text-white/60">Рекорд: {best}</p>}
            <div className="flex items-center gap-2">
              <Button onClick={startGame} size="lg">
                {state === "ended" ? <RotateCcw className="size-4" /> : <Target className="size-4" />}
                {state === "ended" ? "Играть снова" : "В атаку"}
              </Button>
              <Button variant="outline" size="lg" onClick={onExit}>
                <LogOut className="size-4" />
                Выйти
              </Button>
            </div>
            <p className="max-w-xs text-xs text-white/60">
              WASD/стрелки — движение, мышь (после клика по экрану) или стрелки влево/вправо — поворот,
              пробел или клик — выстрел из дробовика. {ENEMY_LABELS.join(", ")} идут волна за волной,
              ☕ восполняет здоровье.
            </p>
            <GameLeaderboard workspaceId={workspaceId} gameId="doom" refreshKey={leaderboardKey} />
          </div>
        )}

        {paused && state === "playing" && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-3 bg-black/75 text-center text-white">
            <p className="text-2xl font-semibold">Пауза</p>
            <div className="flex items-center gap-2">
              <Button onClick={togglePause} size="lg">
                <Play className="size-4" /> Продолжить
              </Button>
              <Button variant="outline" size="lg" onClick={onExit}>
                <LogOut className="size-4" />
                Выйти
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
