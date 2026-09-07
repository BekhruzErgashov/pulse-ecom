"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createQuestionSchema } from "@/lib/validation";
import type { Question, User } from "@/lib/models";

export function CreateQuestionDialog({
  workspaceId,
  teamMembers,
  onCreated,
}: {
  workspaceId: string;
  teamMembers: User[];
  onCreated: (question: Question) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [recipients, setRecipients] = React.useState<string[]>([]);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  function toggleRecipient(email: string) {
    setRecipients((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createQuestionSchema.safeParse({
      workspaceId,
      title,
      recipientEmails: recipients,
    });
    if (!parsed.success) {
      setError(
        parsed.error.flatten().fieldErrors.title?.[0] ??
          parsed.error.flatten().fieldErrors.recipientEmails?.[0],
      );
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Не удалось создать вопрос");
        return;
      }
      const data = await res.json();
      onCreated(data.question);
      toast.success("Вопрос отправлен");
      setOpen(false);
      setTitle("");
      setRecipients([]);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Новый вопрос
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новый вопрос</DialogTitle>
            <DialogDescription>
              Вопрос увидят только выбранные получатели и вы.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="question-title">Вопрос</Label>
              <Textarea
                id="question-title"
                placeholder="О чём хотите спросить?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
              />
              {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label>Кому адресован вопрос</Label>
              {teamMembers.length === 0 ? (
                <p className="text-sm text-[var(--color-ink-soft)]">
                  Пока нет других участников команды.
                </p>
              ) : (
                <div className="flex flex-col gap-2 rounded-(--radius-control) border border-[var(--color-line)] p-2">
                  {teamMembers.map((member) => (
                    <label
                      key={member.email}
                      className="flex cursor-pointer items-center gap-2.5 rounded-(--radius-control) px-2 py-1.5 hover:bg-[var(--color-paper)]"
                    >
                      <Checkbox
                        checked={recipients.includes(member.email)}
                        onChange={() => toggleRecipient(member.email)}
                      />
                      <Avatar name={member.name} color={member.color} size="sm" />
                      <span className="text-sm">{member.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={pending || !title.trim() || recipients.length === 0}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                Отправить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
