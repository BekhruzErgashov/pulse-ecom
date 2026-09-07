import { NextRequest, NextResponse, after } from "next/server";
import { createQuestionSchema } from "@/lib/validation";
import { createQuestion, listQuestionsForUser, listWorkspaceMemberEmails } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { canAccessWorkspace } from "@/lib/access";
import { escapeHtml, questionsDeepLink } from "@/lib/telegram";
import { notify } from "@/lib/notifications";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "Не указано пространство" }, { status: 400 });
  }
  if (!(await canAccessWorkspace(user, workspaceId))) {
    return NextResponse.json({ error: "Нет доступа к этому пространству" }, { status: 403 });
  }
  const questions = await listQuestionsForUser(workspaceId, user.email);
  return NextResponse.json({ questions });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = createQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!(await canAccessWorkspace(user, parsed.data.workspaceId))) {
    return NextResponse.json({ error: "Нет доступа к этому пространству" }, { status: 403 });
  }

  const recipients = parsed.data.recipientEmails.filter((e) => e !== user.email);
  if (recipients.length === 0) {
    return NextResponse.json(
      { error: "Выберите хотя бы одного получателя, отличного от вас" },
      { status: 400 },
    );
  }

  // Приватность между командами: получателем может быть только участник
  // того же пространства, где создаётся вопрос.
  const workspaceMemberEmails = await listWorkspaceMemberEmails(parsed.data.workspaceId);
  const invalidRecipients = recipients.filter((e) => !workspaceMemberEmails.includes(e));
  if (invalidRecipients.length > 0) {
    return NextResponse.json(
      { error: "Получатель должен быть участником этого пространства" },
      { status: 400 },
    );
  }

  const question = await createQuestion({
    workspaceId: parsed.data.workspaceId,
    authorEmail: user.email,
    recipientEmails: recipients,
    title: parsed.data.title,
  });

  // after() гарантирует, что все fetch к Telegram API успеют завершиться до
  // заморозки serverless-функции — без этого `void notifyUser(...)` мог
  // обрываться на середине, и уведомление о вопросе приходило с задержкой
  // (со следующим вызовом функции) или не приходило вовсе.
  for (const recipient of recipients) {
    after(() =>
      notify({
        userEmail: recipient,
        type: "question_asked",
        title: `Вопрос от ${user.name}`,
        body: question.title,
        link: `/w/${question.workspaceId}/questions`,
        telegramText: `❓ <b>${escapeHtml(user.name)}</b> задал(а) вам вопрос:\n${escapeHtml(question.title)}\n\n<code>Q:${question.id}</code>\n\nОтветьте на это сообщение, чтобы отправить ответ прямо из Telegram.`,
        telegramKeyboard: [[{ text: "Открыть", url: questionsDeepLink(question.workspaceId) }]],
        prefKey: "notifyQuestions",
      }),
    );
  }

  return NextResponse.json({ question }, { status: 201 });
}
