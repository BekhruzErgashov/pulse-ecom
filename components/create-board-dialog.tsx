"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
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
import { createBoardSchema } from "@/lib/validation";
import type { BoardWithProgress } from "@/lib/models";

export function CreateBoardDialog({
  workspaceId,
  onCreated,
}: {
  workspaceId: string;
  onCreated: (board: BoardWithProgress) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createBoardSchema.safeParse({ workspaceId, name, description });
    if (!parsed.success) {
      setError(parsed.error.flatten().fieldErrors.name?.[0]);
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      const res = await fetch("/api/boards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Не удалось создать доску");
        return;
      }
      const data = await res.json();
      onCreated({ ...data.board, taskCount: 0, doneCount: 0, latestTaskAt: null });
      toast.success("Доска создана");
      setOpen(false);
      setName("");
      setDescription("");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Новая доска
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая доска</DialogTitle>
            <DialogDescription>
              Доска объединяет задачи одного проекта или направления.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="board-name">Название</Label>
              <Input
                id="board-name"
                placeholder="Запуск нового продукта"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="board-description">Описание (необязательно)</Label>
              <Textarea
                id="board-description"
                placeholder="Коротко, о чём эта доска"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                Создать
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
