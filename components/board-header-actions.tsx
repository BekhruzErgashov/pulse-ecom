"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Archive, ChevronDown, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EditBoardDialog } from "@/components/edit-board-dialog";
import { ArchiveDialog } from "@/components/archive-dialog";
import type { Board } from "@/lib/models";

export function BoardHeaderActions({ board: initialBoard }: { board: Board }) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  // Только вид блока с названием доски — по референсу это компактная
  // строка «Название ⌄» с действиями в выпадающем меню, а не отдельный
  // крупный заголовок с двумя кнопками рядом (как в светлой теме).
  // Функциональность (редактировать/удалить) та же самая, просто
  // спрятана за шевроном вместо двух всегда видимых кнопок.
  const isDarkGlass = resolvedTheme === "dark-glass";
  const [board, setBoard] = React.useState(initialBoard);
  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);

  function confirmDelete() {
    toast(`Удалить доску «${board.name}»?`, {
      description: "Все задачи на доске будут удалены безвозвратно.",
      action: {
        label: "Удалить",
        onClick: async () => {
          const res = await fetch(`/api/boards/${board.id}`, { method: "DELETE" });
          if (!res.ok) {
            toast.error("Не удалось удалить доску");
            return;
          }
          toast.success("Доска удалена");
          router.push(`/w/${board.workspaceId}/boards`);
          router.refresh();
        },
      },
      cancel: { label: "Отмена", onClick: () => {} },
    });
  }

  if (isDarkGlass) {
    return (
      <>
        <div className="mb-4 flex items-center justify-between gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger>
              <button
                type="button"
                className="flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-lg font-semibold tracking-tight transition-colors hover:text-[var(--color-signal-ink)]"
              >
                {board.name}
                <ChevronDown className="size-4 text-[var(--color-ink-soft)]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setEditOpen(true)}>
                <Pencil className="size-3.5" /> Редактировать
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setArchiveOpen(true)}>
                <Archive className="size-3.5" /> Архив
              </DropdownMenuItem>
              <DropdownMenuItem onClick={confirmDelete} variant="destructive">
                <Trash2 className="size-3.5" /> Удалить
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {board.description && (
          <p className="-mt-2 mb-4 max-w-2xl text-sm text-[var(--color-ink-soft)]">
            {board.description}
          </p>
        )}
        <EditBoardDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          board={board}
          onUpdated={setBoard}
        />
        <ArchiveDialog
          open={archiveOpen}
          onOpenChange={setArchiveOpen}
          boardId={board.id}
          onRestored={() => router.refresh()}
        />
      </>
    );
  }

  return (
    <>
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">Доска</p>
          <h1 className="text-2xl font-semibold tracking-tight">{board.name}</h1>
          {board.description && (
            <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-soft)]">
              {board.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)}>
            <Archive className="size-3.5" /> Архив
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5" /> Редактировать
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={confirmDelete}
            className="text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
          >
            <Trash2 className="size-3.5" /> Удалить
          </Button>
        </div>
      </div>
      <EditBoardDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        board={board}
        onUpdated={setBoard}
      />
      <ArchiveDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        boardId={board.id}
        onRestored={() => router.refresh()}
      />
    </>
  );
}
