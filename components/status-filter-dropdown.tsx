"use client";

import * as React from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatusFilterValue = "all" | "open" | "closed";

const OPTIONS: { value: StatusFilterValue; label: string }[] = [
  { value: "open", label: "Открытые задачи" },
  { value: "closed", label: "Закрытые задачи" },
];

/**
 * Фильтр по статусу — три варианта, по образцу типового выпадающего списка
 * статусов в других трекерах (скриншот пользователя: «Any status / Open
 * requests / Closed requests»). «Открытые» — всё, что не в этапе «Готово»,
 * «Закрытые» — только «Готово». Не путать с этапами канбана: это отдельная,
 * более грубая группировка (открыто/закрыто), а не выбор конкретной колонки.
 */
export function StatusFilterDropdown({
  value,
  onChange,
}: {
  value: StatusFilterValue;
  onChange: (value: StatusFilterValue) => void;
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

  const currentLabel = value === "all" ? "Любой статус" : OPTIONS.find((o) => o.value === value)?.label ?? "Любой статус";
  const isFiltered = value !== "all";

  function select(next: StatusFilterValue) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex items-center gap-2 rounded-(--radius-control) border px-3 py-1.5 text-sm font-medium transition-colors",
          open || isFiltered
            ? "border-[var(--color-signal)] bg-[var(--color-signal-soft)] text-[var(--color-signal-ink)]"
            : "border-[var(--color-line)] bg-[var(--color-paper-raised)] text-[var(--color-ink-soft)] hover:bg-[var(--color-paper)]",
        )}
      >
        {currentLabel}
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          className="panel absolute z-40 mt-1.5 min-w-[13rem] animate-in fade-in slide-in-from-top-1 duration-150 overflow-hidden p-1 shadow-md"
        >
          <button
            type="button"
            role="option"
            aria-selected={value === "all"}
            onClick={() => select("all")}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-(--radius-control) px-2.5 py-2 text-left text-sm hover:bg-[var(--color-paper)]",
              value === "all" && "font-medium text-[var(--color-signal-ink)]",
            )}
          >
            Любой статус
            {value === "all" && <Check className="size-3.5 shrink-0" />}
          </button>

          <div className="my-1 h-px bg-[var(--color-line)]" />

          {OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={value === option.value}
              onClick={() => select(option.value)}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-(--radius-control) px-2.5 py-2 text-left text-sm hover:bg-[var(--color-paper)]",
                value === option.value && "font-medium text-[var(--color-signal-ink)]",
              )}
            >
              {option.label}
              {value === option.value && <Check className="size-3.5 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
