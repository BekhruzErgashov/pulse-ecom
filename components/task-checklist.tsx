"use client";

import * as React from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { TaskChecklistItem } from "@/lib/models";
import { cn } from "@/lib/utils";

/**
 * Чек-лист задачи — вынесен из task-dialog.tsx в отдельный файл (по
 * структуре загруженного пользователем референса task-checklist.tsx),
 * только для тёмной темы. Сама логика (загрузка/добавление/переключение/
 * удаление через /api/tasks/[id]/checklist...) осталась в
 * task-dialog.tsx — он владеет данными и правами, этот компонент только
 * отрисовывает то, что передано, и вызывает колбэки. В референсе чек-лист
 * хранился прямо в задаче (`task.checklist`, общий PATCH
 * /api/tasks/[id]) — у нас для него настоящая отдельная таблица и API
 * (см. app/api/tasks/[id]/checklist), эта разница сознательно сохранена,
 * чтобы не потерять уже рабочую фичу.
 */
export function TaskChecklist({
  items,
  loading,
  pending,
  newText,
  onNewTextChange,
  onAdd,
  onToggle,
  onDelete,
  showAddForm = true,
  className,
}: {
  items: TaskChecklistItem[];
  loading: boolean;
  pending: boolean;
  newText: string;
  onNewTextChange: (value: string) => void;
  onAdd: (e: React.FormEvent) => void;
  onToggle: (item: TaskChecklistItem) => void;
  onDelete: (itemId: string) => void;
  /** По правке пользователя — в попапе просмотра уже созданной задачи
   *  форма добавления пункта скрыта (виден только сам чек-лист с
   *  отметками, по референсу-скриншоту); в форме создания новой задачи
   *  добавление пунктов остаётся (там это единственный способ вообще
   *  наполнить чек-лист). По умолчанию показана — чтобы не ломать другие
   *  места использования, если появятся. */
  showAddForm?: boolean;
  /** Внешний отступ — задаёт родитель (task-dialog.tsx: mt-[28px], как
   *  между секциями в макете). */
  className?: string;
}) {
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Заголовок + счётчик — точно по макету: margin-bottom:12px,
          заголовок 15px/700, счётчик 12.5px/rgba(255,255,255,.6). */}
      <div className="mb-3 flex items-center justify-between">
        <p className="font-display m-0 text-[15px] font-bold text-white">Чек-лист</p>
        {items.length > 0 && (
          <span className="text-[12.5px] text-white/60">
            {done} из {items.length}
          </span>
        )}
      </div>
      {items.length > 0 && (
        // ВОЗВРАЩЕНО на общий токен --color-signal (был временно #8c7bff
        // по буквальному значению из Figma-узла 4:1872) — по правке
        // пользователя «с учётом скилов дизайна»: единый акцентный цвет по
        // всему приложению читается собраннее/дороже, чем два разных
        // «синих» тона (общий #5b9dff и точечный figma-фиолетовый #8c7bff)
        // рядом друг с другом. --color-signal уже раньше был осознанно
        // выбран пользователем как единый акцент («в целом всё #5b9dff») —
        // эта карточка была единственным местом-исключением.
        <Progress
          value={pct}
          className="mb-[14px] h-[6px] bg-white/[0.14]"
          colorVar="linear-gradient(90deg, var(--color-signal), var(--color-signal-light))"
        />
      )}

      {loading ? (
        // Скелетон по форме будущих строк (чекбокс + строка текста) —
        // вместо текста «Загрузка…»: по правке «дороже» такие спиннеры-
        // текст читаются дёшево, пульсирующий плейсхолдер по форме
        // контента ощущается отзывчивее.
        <div className="flex flex-col gap-[10px]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-[10px]">
              <Skeleton className="size-[22px] shrink-0 rounded-[6px]" />
              <Skeleton className="h-[14px] flex-1" style={{ maxWidth: `${70 - i * 15}%` }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        // Раньше при пустом чек-листе тут не рендерилось вообще ничего
        // (ни списка, ни текста) — визуально выглядело как «сломанная»
        // секция: заголовок и сразу большой пустой отступ до следующего
        // блока. Пустое состояние теперь того же вида, что у «Файлов».
        !showAddForm && <p className="m-0 text-xs text-white/40">Пунктов пока нет.</p>
      ) : (
        // Пункты — точно по макету: gap:10px между строками, чекбокс
        // 20x20 rounded-md (border-radius:6px, НЕ круг), border 1.5px.
        <div className="flex flex-col gap-[10px]">
          {items.map((item) => (
            <div key={item.id} className="group flex items-center gap-[10px]">
              <button
                type="button"
                onClick={() => onToggle(item)}
                className={cn(
                  // 22px/radius-6/border-1px — сверено по Figma (узлы
                  // 4:1876 отмечен / 4:1892 не отмечен), было 20px/1.5px.
                  // border-[color:var(--color-line-strong)] — было
                  // border-white/35 (0.35), теперь общий "усиленный"
                  // уровень обводки (0.32), тот же, что у пунктирной
                  // кнопки добавления файла.
                  "flex size-[22px] shrink-0 items-center justify-center rounded-[6px] border text-white transition-colors",
                  item.done ? "border-transparent" : "border-[color:var(--color-line-strong)] text-transparent",
                )}
                // var(--color-signal) — единый акцент, см. комментарий у
                // прогресс-бара выше (было точечное #8c7bff из Figma).
                style={item.done ? { background: "var(--color-signal)" } : undefined}
                aria-label={item.done ? "Снять отметку" : "Отметить выполненным"}
              >
                {/* strokeWidth={3} — намеренное исключение из общего
                    веса линии (2 по всей теме): на 12px-иконке галочки
                    2px читается слишком тонко/блёкло, это стандартная
                    практика для мелких иконок, а не небрежность. */}
                <Check className="size-3" strokeWidth={3} />
              </button>
              <span className={cn("flex-1 text-[14px]", item.done ? "text-white/40 line-through" : "text-white")}>
                {item.text}
              </span>
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                aria-label="Удалить пункт"
                className="hidden shrink-0 text-white/40 hover:text-[var(--color-danger)] group-hover:block"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showAddForm && (
        <form onSubmit={onAdd} className="flex items-center gap-1.5 pt-1">
          <Input
            value={newText}
            onChange={(e) => onNewTextChange(e.target.value)}
            placeholder="Добавить пункт…"
            className="h-7 text-xs"
            maxLength={300}
            aria-label="Новый пункт чек-листа"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 px-2"
            disabled={pending || !newText.trim()}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
          </Button>
        </form>
      )}
    </div>
  );
}
