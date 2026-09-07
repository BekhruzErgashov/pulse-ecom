import { NextRequest, NextResponse, after } from "next/server";
import { createMessageSchema } from "@/lib/validation";
import { createMessage, getQuestion } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { escapeHtml, questionsDeepLink } from "@/lib/telegram";
import { notify } from "@/lib/notifications";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const question = await getQuestion(id);
  const isParticipant =
    question && (question.authorEmail === user.email || question.recipientEmails.includes(user.email));
  if (!question || !isParticipant) {
    return NextResponse.json({ error: "Вопрос не найден" }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  const parsed = createMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const message = await createMessage({
    questionId: id,
    authorEmail: user.email,
    body: parsed.data.body,
  });

  const others = [question.authorEmail, ...question.recipientEmails].filter(
    (e): e is string => Boolean(e) && e !== user.email,
  );
  for (const other of others) {
    after(() =>
      notify({
        userEmail: other,
        type: "question_answered",
        title: `Ответ от ${user.name}`,
        body: parsed.data.body,
        link: `/w/${question.workspaceId}/questions`,
        telegramText: `💬 <b>${escapeHtml(user.name)}</b> ответил(а) на вопрос «${escapeHtml(question.title)}»:\n${escapeHtml(parsed.data.body)}\n\n<code>Q:${question.id}</code>`,
        telegramKeyboard: [[{ text: "Открыть", url: questionsDeepLink(question.workspaceId) }]],
        prefKey: "notifyQuestions",
      }),
    );
  }

  return NextResponse.json({ message }, { status: 201 });
}
