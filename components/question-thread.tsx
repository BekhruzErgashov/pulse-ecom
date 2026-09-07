"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckCircle2, Loader2, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { createMessageSchema } from "@/lib/validation";
import type { Question, QuestionMessage, User } from "@/lib/models";

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function QuestionThread({
  question: initialQuestion,
  initialMessages,
  currentUserEmail,
  allUsers,
}: {
  question: Question;
  initialMessages: QuestionMessage[];
  currentUserEmail: string;
  allUsers: User[];
}) {
  const [question, setQuestion] = React.useState(initialQuestion);
  const [messages, setMessages] = React.useState(initialMessages);
  const [reply, setReply] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [statusPending, setStatusPending] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (document.hidden) return;
      try {
        const res = await fetch(`/api/questions/${question.id}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setQuestion(data.question);
          setMessages(data.messages);
        }
      } catch {
        // Тихо игнорируем — это фоновая, необязательная проверка.
      }
    }

    const interval = setInterval(poll, 12_000);
    function onVisibilityChange() {
      if (!document.hidden) poll();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [question.id]);

  const usersByEmail = new Map(allUsers.map((u) => [u.email, u]));

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createMessageSchema.safeParse({ body: reply });
    if (!parsed.success) {
      toast.error(parsed.error.flatten().fieldErrors.body?.[0] ?? "Введите сообщение");
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/questions/${question.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        toast.error("Не удалось отправить сообщение");
        return;
      }
      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setReply("");
    } finally {
      setPending(false);
    }
  }

  async function toggleStatus() {
    const nextStatus = question.status === "open" ? "answered" : "open";
    setStatusPending(true);
    try {
      const res = await fetch(`/api/questions/${question.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        toast.error("Не удалось обновить статус");
        return;
      }
      const data = await res.json();
      setQuestion(data.question);
      toast.success(nextStatus === "answered" ? "Отмечено как отвечено" : "Вопрос снова открыт");
    } finally {
      setStatusPending(false);
    }
  }

  const recipientNames = question.recipientEmails
    .map((e) => usersByEmail.get(e)?.name ?? e)
    .join(", ");
  const authorName =
    (question.authorEmail && usersByEmail.get(question.authorEmail)?.name) ??
    question.authorEmail ??
    "Удалённый пользователь";

  return (
    <div className="flex flex-col gap-6">
      <div className="panel p-5">
        <div className="mb-2 flex items-start justify-between gap-3">
          <h1 className="text-lg font-semibold leading-snug">{question.title}</h1>
          <Badge variant={question.status === "answered" ? "done" : "todo"}>
            {question.status === "answered" ? "Отвечено" : "Открыт"}
          </Badge>
        </div>
        <p className="text-sm text-[var(--color-ink-soft)]">
          От {authorName} · кому: {recipientNames}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={toggleStatus}
          disabled={statusPending}
        >
          {statusPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : question.status === "open" ? (
            <CheckCircle2 className="size-3.5" />
          ) : (
            <RotateCcw className="size-3.5" />
          )}
          {question.status === "open" ? "Отметить отвеченным" : "Снова открыть"}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {messages.map((m) => {
          const author = m.authorEmail ? usersByEmail.get(m.authorEmail) : undefined;
          const isMine = m.authorEmail === currentUserEmail;
          const displayName = author?.name ?? m.authorEmail ?? "Удалённый пользователь";
          return (
            <div
              key={m.id}
              className={`flex gap-2.5 ${isMine ? "flex-row-reverse text-right" : ""}`}
            >
              <Avatar name={displayName} color={author?.color} size="sm" />
              <div className={`max-w-[80%] ${isMine ? "items-end" : "items-start"} flex flex-col gap-1`}>
                <div
                  className={`panel px-3 py-2 text-sm ${
                    isMine ? "bg-[var(--color-signal-soft)]" : ""
                  }`}
                >
                  {m.body}
                </div>
                <span className="text-xs text-[var(--color-ink-soft)]">
                  {displayName} · {formatDateTime(m.createdAt)}
                </span>
              </div>
            </div>
          );
        })}
        {messages.length === 0 && (
          <p className="py-6 text-center text-sm text-[var(--color-ink-soft)]">
            Пока нет ответов.
          </p>
        )}
      </div>

      <form onSubmit={handleReply} className="flex flex-col gap-2">
        <Textarea
          placeholder="Написать ответ..."
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
        <Button type="submit" disabled={pending || !reply.trim()} className="self-end">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Отправить
        </Button>
      </form>
    </div>
  );
}
