"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditBoardDialog } from "@/components/edit-board-dialog";
import type { Board } from "@/lib/models";

export function BoardHeaderActions({ board: initialBoard }: { board: Board }) {
  const router = useRouter();
  const [board, setBoard] = React.useState(initialBoard);
  const [editOpen, setEditOpen] = React.useState(false);

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
    </>
  );
}
