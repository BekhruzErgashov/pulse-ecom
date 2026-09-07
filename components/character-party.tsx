"use client";

import * as React from "react";
import { PartyPopper, X } from "lucide-react";

/** 15 персонажей — уже вырезаны по силуэту, с прозрачным фоном (public/characters/char-0..14.png). */
const CHAR_COUNT = 15;
const BOX = 84;

type CharState = {
  x: number;
  y: number;
  orbitRadius: number;
  orbitSpeed: number;
  orbitPhase: number;
  ease: number;
};

function makeChars(): CharState[] {
  const start =
    typeof window !== "undefined"
      ? { x: window.innerWidth - 40, y: window.innerHeight - 40 }
      : { x: 0, y: 0 };
  return Array.from({ length: CHAR_COUNT }, () => ({
    x: start.x,
    y: start.y,
    orbitRadius: 30 + Math.random() * 130,
    orbitSpeed: 0.4 + Math.random() * 1.1,
    orbitPhase: Math.random() * Math.PI * 2,
    ease: 0.04 + Math.random() * 0.08,
  }));
}

/**
 * Кнопка «Персонажи»: по клику 15 иконок вылетают из кнопки и начинают
 * роиться вокруг курсора мыши (у каждой свой радиус/скорость орбиты и
 * инерция — отсюда эффект живой стайки, а не жёсткого прилипания к точке).
 * Повторный клик — все персонажи слетаются обратно в кнопку и исчезают.
 */
export function CharacterParty() {
  const [active, setActive] = React.useState(false);
  const exitingRef = React.useRef(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const charsRef = React.useRef<CharState[]>(makeChars());
  const mouseRef = React.useRef({ x: 0, y: 0 });
  const spawnRef = React.useRef({ x: 0, y: 0 });
  const rafRef = React.useRef<number | null>(null);
  const tRef = React.useRef(0);

  React.useEffect(() => {
    mouseRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    function onMove(e: MouseEvent) {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
    }
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  React.useEffect(() => {
    if (!active) return;

    const rect = buttonRef.current?.getBoundingClientRect();
    spawnRef.current = rect
      ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      : { x: window.innerWidth - 40, y: window.innerHeight - 40 };

    charsRef.current.forEach((c) => {
      c.x = spawnRef.current.x;
      c.y = spawnRef.current.y;
    });
    exitingRef.current = false;

    function tick() {
      tRef.current += 1;
      const target = exitingRef.current ? spawnRef.current : mouseRef.current;

      let allHome = true;
      charsRef.current.forEach((c, i) => {
        const angle = c.orbitPhase + tRef.current * 0.02 * c.orbitSpeed;
        const tx = target.x + (exitingRef.current ? 0 : Math.cos(angle) * c.orbitRadius);
        const ty = target.y + (exitingRef.current ? 0 : Math.sin(angle) * c.orbitRadius);

        c.x += (tx - c.x) * c.ease;
        c.y += (ty - c.y) * c.ease;

        const el = itemRefs.current[i];
        if (el) {
          el.style.transform = `translate3d(${c.x - BOX / 2}px, ${c.y - BOX / 2}px, 0)`;
        }

        if (exitingRef.current && Math.hypot(tx - c.x, ty - c.y) > 4) allHome = false;
      });

      if (exitingRef.current && allHome) {
        setActive(false);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active]);

  React.useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") exitingRef.current = true;
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  function toggle() {
    if (!active) {
      charsRef.current = makeChars();
      tRef.current = 0;
      setActive(true);
    } else {
      exitingRef.current = true;
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className="fixed bottom-6 right-6 z-[60] flex items-center gap-1.5 rounded-full bg-[var(--color-signal)] px-4 py-2.5 text-sm font-semibold text-[var(--color-on-accent)] shadow-lg transition hover:opacity-90"
        aria-label={active ? "Убрать персонажей" : "Выпустить персонажей"}
      >
        {active ? <X className="size-4" /> : <PartyPopper className="size-4" />}
        {active ? "Убрать" : "Uzumki"}
      </button>

      {active && (
        <div className="pointer-events-none fixed inset-0 z-50">
          {Array.from({ length: CHAR_COUNT }, (_, i) => (
            <div
              key={i}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              className="absolute left-0 top-0"
              style={{ width: BOX, height: BOX, willChange: "transform" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- маленький локальный спрайт, next/image избыточен */}
              <img
                src={`/characters/char-${i}.png`}
                alt=""
                draggable={false}
                className="size-full object-contain [filter:drop-shadow(0_6px_10px_rgba(0,0,0,0.35))]"
              />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
