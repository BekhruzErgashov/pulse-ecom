"use client";

import { Check, ChevronDown, User as UserIcon } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar } from "@/components/ui/avatar";
import type { User } from "@/lib/models";
import { cn } from "@/lib/utils";

/**
 * Мультивыбор исполнителей — по правке пользователя («нужно чтобы можно
 * было выбрать несколько исполнителей»), заменяет одиночный
 * `<Select>`/assigneeEmail в форме задачи (используется и в тёмной, и в
 * светлой теме — сама возможность назначить нескольких это изменение
 * модели данных, а не визуальный редизайн одной темы).
 *
 * `DropdownMenuItem` из ui/dropdown-menu.tsx не годится — он закрывает
 * меню по клику на пункт, что ломало бы выбор сразу нескольких галочек.
 * Поэтому здесь свои строки-кнопки внутри DropdownMenuContent, меню
 * остаётся открытым, пока не кликнут вне его (это уже умеет
 * DropdownMenu) или на сам триггер повторно.
 */
export function AssigneeMultiSelect({
  members,
  value,
  onChange,
  className,
  id,
}: {
  members: User[];
  value: string[];
  onChange: (emails: string[]) => void;
  className?: string;
  id?: string;
}) {
  const selected = members.filter((m) => value.includes(m.email));

  function toggle(email: string) {
    onChange(value.includes(email) ? value.filter((e) => e !== email) : [...value, email]);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <button
          id={id}
          type="button"
          className={cn(
            "flex h-9 w-full items-center gap-1.5 rounded-(--radius-control) border border-[var(--color-line)] bg-[var(--color-popover)] px-2.5 text-left text-sm",
            className,
          )}
        >
          {selected.length === 0 ? (
            <span className="flex items-center gap-1.5 text-[var(--color-ink-soft)]">
              <UserIcon className="size-3.5" /> Не назначен
            </span>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <div className="flex shrink-0 -space-x-1.5">
                {selected.slice(0, 3).map((m) => (
                  <Avatar key={m.email} name={m.name} color={m.color} size="sm" />
                ))}
              </div>
              <span className="truncate">
                {selected.length === 1 ? selected[0].name : `Исполнителей: ${selected.length}`}
              </span>
            </div>
          )}
          <ChevronDown className="ml-auto size-3.5 shrink-0 text-[var(--color-ink-soft)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 w-64 overflow-y-auto">
        {members.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-[var(--color-ink-soft)]">Нет участников</p>
        ) : (
          members.map((m) => {
            const checked = value.includes(m.email);
            return (
              <button
                key={m.email}
                type="button"
                onClick={() => toggle(m.email)}
                className="flex w-full items-center gap-2 rounded-(--radius-control) px-2 py-1.5 text-left text-sm hover:bg-[var(--color-paper)]"
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded border",
                    checked
                      ? "border-[var(--color-signal)] bg-[var(--color-signal)] text-white"
                      : "border-[var(--color-line)]",
                  )}
                >
                  {checked && <Check className="size-3" />}
                </span>
                <Avatar name={m.name} color={m.color} size="sm" />
                <span className="truncate">{m.name}</span>
              </button>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
