"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsUpDown, Layers, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Workspace } from "@/lib/models";

export function WorkspaceSwitcher({
  workspaces,
  currentWorkspaceId,
}: {
  workspaces: Workspace[];
  currentWorkspaceId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = React.useTransition();
  const current = workspaces.find((w) => w.id === currentWorkspaceId) ?? workspaces[0];
  const section = pathname?.includes("/questions") ? "questions" : "boards";

  function switchTo(workspaceId: string) {
    if (workspaceId === currentWorkspaceId) return;
    // Запоминаем выбор на случай захода без явного пространства в пути (/boards, /questions).
    // eslint-disable-next-line react-hooks/immutability
    document.cookie = `ttt_current_ws=${workspaceId}; path=/; max-age=${60 * 60 * 24 * 365}`;
    startTransition(() => {
      router.push(`/w/${workspaceId}/${section}`);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger>
        <button className="flex items-center gap-1.5 rounded-(--radius-control) border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-3 py-1.5 text-sm font-medium hover:bg-[var(--color-paper)] disabled:opacity-60">
          {isPending ? (
            <Loader2 className="size-3.5 animate-spin text-[var(--color-ink-soft)]" />
          ) : (
            <Layers className="size-3.5 text-[var(--color-ink-soft)]" />
          )}
          {current?.name ?? "Пространство"}
          <ChevronsUpDown className="size-3 text-[var(--color-ink-soft)]" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} onClick={() => switchTo(w.id)}>
            {w.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
