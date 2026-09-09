"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { PRIORITIES } from "@/lib/schema";
import type { TaskWithBoard } from "@/lib/models";

/**
 * Глобальный поиск задач по всем доскам пространства (не только текущая) —
 * по образцу Asana search. Живёт в шапке (TeamHeader), доступен с любой
 * страницы пространства. Клик по результату переводит на доску этой
 * задачи с ?taskId=... — саму доску учим открывать диалог этой задачи
 * при заходе (см. initialOpenTaskId в kanban-board.tsx и boards/[id]/page.tsx).
 */
export function GlobalSearch({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<TaskWithBoard[]>([]);
  const [loading, setLoading] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Дебаунс запроса — не гоняем по базе на каждый символ. Запрос короче
  // 2 символов вообще не шлём (см. ту же границу на сервере).
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tasks/search?workspaceId=${workspaceId}&q=${encodeURIComponent(q)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.tasks ?? []);
        }
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, workspaceId]);

  function openTask(task: TaskWithBoard) {
    setOpen(false);
    setQuery("");
    router.push(`/w/${workspaceId}/boards/${task.boardId}?taskId=${task.id}`);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative w-36 sm:w-52">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-ink-soft)]" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Поиск задач…"
          aria-label="Поиск задач по всему пространству"
          className="h-8 w-full rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] pl-8 pr-7 text-xs outline-none transition-colors focus:border-[var(--color-signal)]"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
            aria-label="Очистить поиск"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="panel border-solid absolute right-0 top-full z-40 mt-1.5 max-h-80 w-80 overflow-y-auto p-1.5">
          {loading ? (
            <div className="flex items-center justify-center gap-1.5 py-6 text-xs text-[var(--color-ink-soft)]">
              <Loader2 className="size-3.5 animate-spin" /> Ищем…
            </div>
          ) : results.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-[var(--color-ink-soft)]">Ничего не найдено</p>
          ) : (
            results.map((task) => {
              const priorityLabel = PRIORITIES.find((p) => p.id === task.priority)?.label;
              return (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => openTask(task)}
                  className="flex w-full flex-col gap-0.5 rounded-(--radius-control) px-2 py-1.5 text-left text-xs hover:bg-[var(--color-paper)]"
                >
                  <span className="truncate font-medium text-[var(--color-ink)]">{task.title}</span>
                  <span className="truncate text-[var(--color-ink-soft)]">
                    {task.boardName} · {priorityLabel}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
