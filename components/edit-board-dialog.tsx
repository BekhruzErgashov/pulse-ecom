"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateBoardSchema } from "@/lib/validation";
import type { Board } from "@/lib/models";

export function EditBoardDialog({
  open,
  onOpenChange,
  board,
  onUpdated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  board: Board;
  onUpdated: (board: Board) => void;
}) {
  const [name, setName] = React.useState(board.name);
  const [description, setDescription] = React.useState(board.description);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (open) {
      setName(board.name);
      setDescription(board.description);
      setError(undefined);
    }
  }, [open, board]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = updateBoardSchema.safeParse({ name, description });
    if (!parsed.success) {
      setError(parsed.error.flatten().fieldErrors.name?.[0]);
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      const res = await fetch(`/api/boards/${board.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Не удалось сохранить изменения");
        return;
      }
      const data = await res.json();
      onUpdated(data.board);
      toast.success("Доска обновлена");
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Редактировать доску</DialogTitle>
          <DialogDescription>Название и описание видны всей команде.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-board-name">Название</Label>
            <Input
              id="edit-board-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
            {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-board-description">Описание</Label>
            <Textarea
              id="edit-board-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending || !name.trim()}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
