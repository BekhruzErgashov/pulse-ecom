"use client";

import * as React from "react";
import { Check, ChevronDown, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ALL_WEEKS, formatWeekLabelShort } from "@/lib/week";

/**
 * Выбор недели для колонки «Готово» на длительных досках — по умолчанию
 * видна только текущая неделя (см. lib/week.ts), этот пикер даёт заглянуть
 * в прошлые недели, не перегружая колонку всей историей. Показывается при
 * статус-фильтре «Любой статус» (по умолчанию — текущая неделя) и
 * «Закрытые задачи» (по умолчанию — «Все недели», см. вызывающие
 * компоненты). Пункт «Все недели» добавляется здесь же, сверху списка.
 */
export function WeekPicker({
  value,
  weeks,
  onChange,
}: {
  value: string;
  weeks: { weekKey: string; count: number }[];
  onChange: (weekKey: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (weeks.length === 0) return null;

  const totalCount = weeks.reduce((sum, w) => sum + w.count, 0);

  function select(weekKey: string) {
    onChange(weekKey);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Выбрать неделю"
        className={cn(
          "flex items-center gap-1 rounded-(--radius-control) border px-1.5 py-0.5 text-[10px] font-medium transition-colors",
          open
            ? "border-[var(--color-signal)] bg-[var(--color-signal-soft)] text-[var(--color-signal-ink)]"
            : "border-[var(--color-line)] bg-[var(--color-paper-raised)] text-[var(--color-ink-soft)] hover:bg-[var(--color-paper)]",
        )}
      >
        <CalendarClock className="size-3" />
        <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          className="panel absolute right-0 z-40 mt-1.5 max-h-64 min-w-[14rem] overflow-y-auto animate-in fade-in slide-in-from-top-1 duration-150 p-1 shadow-md"
        >
          <button
            type="button"
            role="option"
            aria-selected={value === ALL_WEEKS}
            onClick={() => select(ALL_WEEKS)}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-(--radius-control) px-2.5 py-1.5 text-left text-xs hover:bg-[var(--color-paper)]",
              value === ALL_WEEKS && "font-medium text-[var(--color-signal-ink)]",
            )}
          >
            <span>Все недели</span>
            <span className="flex items-center gap-1 text-[var(--color-ink-soft)]">
              {totalCount}
              {value === ALL_WEEKS && <Check className="size-3 shrink-0" />}
            </span>
          </button>

          <div className="my-1 h-px bg-[var(--color-line)]" />

          {weeks.map((w) => (
            <button
              key={w.weekKey}
              type="button"
              role="option"
              aria-selected={value === w.weekKey}
              onClick={() => select(w.weekKey)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-(--radius-control) px-2.5 py-1.5 text-left text-xs hover:bg-[var(--color-paper)]",
                value === w.weekKey && "font-medium text-[var(--color-signal-ink)]",
              )}
            >
              <span>{formatWeekLabelShort(w.weekKey)}</span>
              <span className="flex items-center gap-1 text-[var(--color-ink-soft)]">
                {w.count}
                {value === w.weekKey && <Check className="size-3 shrink-0" />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
