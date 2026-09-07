"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createWorkLinkSchema } from "@/lib/validation";
import type { WorkLink } from "@/lib/models";

export function CreateLinkDialog({
  workspaceId,
  onCreated,
}: {
  workspaceId: string;
  onCreated: (link: WorkLink) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  function reset() {
    setTitle("");
    setUrl("");
    setDescription("");
    setError(undefined);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createWorkLinkSchema.safeParse({ workspaceId, title, url, description });
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      setError(fieldErrors.title?.[0] ?? fieldErrors.url?.[0] ?? fieldErrors.description?.[0]);
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Не удалось добавить ссылку");
        return;
      }
      const data = await res.json();
      onCreated(data.link);
      toast.success("Ссылка добавлена");
      setOpen(false);
      reset();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Добавить ссылку
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая ссылка</DialogTitle>
            <DialogDescription>
              Появится в общем списке — увидят и смогут открыть все участники пространства.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="link-title">Название</Label>
              <Input
                id="link-title"
                placeholder="Например, Uzum Marketing"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                maxLength={120}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="link-url">Ссылка</Label>
              <Input
                id="link-url"
                placeholder="https://..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                maxLength={2000}
                inputMode="url"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="link-description">Описание (необязательно)</Label>
              <Textarea
                id="link-description"
                placeholder="Для чего нужен сервис"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={300}
              />
            </div>
            {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={pending || !title.trim() || !url.trim()}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                Добавить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
