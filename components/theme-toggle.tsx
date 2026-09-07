"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS = [
  { value: "light", label: "Светлая", icon: Sun },
  { value: "dark", label: "Тёмная", icon: Moon },
  { value: "system", label: "Как в системе", icon: Monitor },
] as const;

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  // До гидратации реальная тема неизвестна (она из localStorage), поэтому
  // первый рендер всегда рисует одну и ту же иконку — иначе React ругается
  // на несовпадение разметки сервера и клиента.
  React.useEffect(() => setMounted(true), []);

  const Icon = mounted && resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <button
          type="button"
          aria-label="Тема оформления"
          title="Тема оформления"
          className={
            "flex size-9 items-center justify-center rounded-full text-[var(--color-ink-soft)] transition-colors hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-signal)] " +
            (className ?? "")
          }
        >
          <Icon className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {OPTIONS.map((option) => {
          const OptionIcon = option.icon;
          return (
            <DropdownMenuItem key={option.value} onClick={() => setTheme(option.value)}>
              <OptionIcon className="size-3.5" />
              <span className="flex-1">{option.label}</span>
              {mounted && theme === option.value && (
                <Check className="size-3.5 text-[var(--color-signal)]" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
