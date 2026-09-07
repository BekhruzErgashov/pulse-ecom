"use client";

import * as React from "react";
import Link from "next/link";
import { MessageCircleQuestion } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CreateQuestionDialog } from "@/components/create-question-dialog";
import type { Question, User } from "@/lib/models";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function QuestionsList({
  currentUserEmail,
  initialQuestions,
  teamMembers,
  workspaceId,
}: {
  currentUserEmail: string;
  initialQuestions: Question[];
  teamMembers: User[];
  workspaceId: string;
}) {
  const [questions, setQuestions] = React.useState(initialQuestions);
  const membersByEmail = new Map(teamMembers.map((m) => [m.email, m]));

  // Отмечаем вопросы как просмотренные — по этой метке шапка понимает,
  // что новых вопросов/ответов с прошлого визита не появилось.
  React.useEffect(() => {
    if (questions.length === 0) return;
    const latest = questions.reduce(
      (max, q) => (q.updatedAt > max ? q.updatedAt : max),
      questions[0].updatedAt,
    );
    localStorage.setItem(`ttt_last_seen_questions_${workspaceId}`, latest);
  }, [questions, workspaceId]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <CreateQuestionDialog
          workspaceId={workspaceId}
          teamMembers={teamMembers}
          onCreated={(q) => setQuestions((prev) => [q, ...prev])}
        />
      </div>

      {questions.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center animate-in fade-in duration-300">
          <div className="flex size-12 items-center justify-center rounded-full bg-[var(--color-paper)] text-[var(--color-ink-soft)]">
            <MessageCircleQuestion className="size-5" />
          </div>
          <p className="text-sm font-medium">Пока нет ни одного вопроса</p>
          <p className="max-w-sm text-sm text-[var(--color-ink-soft)]">
            Задайте вопрос конкретному человеку в команде — увидите его только вы и он.
          </p>
        </div>
      ) : (
        <div className="panel divide-y divide-[var(--color-line)]">
          {questions.map((q) => {
            const isAuthor = q.authorEmail === currentUserEmail;
            const otherParty = isAuthor
              ? q.recipientEmails.map((e) => membersByEmail.get(e)?.name ?? e).join(", ")
              : (q.authorEmail && membersByEmail.get(q.authorEmail)?.name) ??
                q.authorEmail ??
                "Удалённый пользователь";
            return (
              <Link
                key={q.id}
                href={`/w/${workspaceId}/questions/${q.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3.5 hover:bg-[var(--color-paper)]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{q.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--color-ink-soft)]">
                    {isAuthor ? "Кому: " : "От: "}
                    {otherParty} · {formatDate(q.updatedAt)}
                  </p>
                </div>
                <Badge variant={q.status === "answered" ? "done" : "todo"}>
                  {q.status === "answered" ? "Отвечено" : "Открыт"}
                </Badge>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
