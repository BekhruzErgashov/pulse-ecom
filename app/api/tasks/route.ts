import { NextRequest, NextResponse, after } from "next/server";
import { createTaskSchema, normalizeAssignees } from "@/lib/validation";
import { createTask, createTaskEvent, getBoard } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { canAccessWorkspace } from "@/lib/access";
import { boardDeepLink, escapeHtml } from "@/lib/telegram";
import { notify } from "@/lib/notifications";

export async function POST(request: NextRequest) {
  const userPromise = getCurrentUser();
  const body = await request.json().catch(() => null);
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const [user, board] = await Promise.all([userPromise, getBoard(parsed.data.boardId)]);
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  if (!board) {
    return NextResponse.json({ error: "Доска не найдена" }, { status: 404 });
  }
  if (!(await canAccessWorkspace(user, board.workspaceId))) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const task = await createTask({
    boardId: parsed.data.boardId,
    title: parsed.data.title,
    description: parsed.data.description ?? "",
    priority: parsed.data.priority ?? "medium",
    kind: parsed.data.kind ?? "normal",
    targetCount: parsed.data.targetCount ?? null,
    foundCount: parsed.data.foundCount ?? null,
    assigneeEmails: normalizeAssignees(parsed.data) ?? [],
    dueDate: parsed.data.dueDate ?? null,
    createdBy: user.email,
  });

  after(() => createTaskEvent({ taskId: task.id, type: "created", authorEmail: user.email }));

  // Уведомляем каждого назначенного, кроме самого автора: назначить задачу
  // можно сразу нескольким людям.
  for (const assignee of task.assigneeEmails.filter((e) => e !== user.email)) {
    // after() гарантирует, что уведомление отправится до заморозки serverless-
    // функции — fire-and-forget (`void`) на Vercel мог обрываться на середине
    // fetch к Telegram API, отсюда задержки/пропажи уведомлений.
    after(() =>
      notify({
        userEmail: assignee,
        type: "task_assigned",
        title: `${user.name} назначил(а) вам задачу`,
        body: task.title,
        link: `/w/${board.workspaceId}/boards/${board.id}`,
        telegramText: `📋 <b>${escapeHtml(user.name)}</b> назначил(а) вам задачу:\n<b>${escapeHtml(task.title)}</b>${
          task.dueDate ? `\nСрок: ${new Date(task.dueDate).toLocaleDateString("ru-RU")}` : ""
        }`,
        telegramKeyboard: [
          [{ text: "Открыть", url: boardDeepLink(board.workspaceId, board.id) }],
          [
            { text: "▶️ В работу", callback_data: `start:${task.id}` },
            { text: "📅 +1 день", callback_data: `snooze:${task.id}` },
            { text: "✅ Готово", callback_data: `done:${task.id}` },
          ],
        ],
        prefKey: "notifyTaskAssigned",
      }),
    );
  }

  return NextResponse.json({ task }, { status: 201 });
}
