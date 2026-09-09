import { NextRequest, NextResponse, after } from "next/server";
import { createTaskEventSchema } from "@/lib/validation";
import { createTaskEvent, getBoard, getTask, listTaskEvents } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { canAccessWorkspace } from "@/lib/access";
import { boardDeepLink, escapeHtml } from "@/lib/telegram";
import { notify } from "@/lib/notifications";

/**
 * Лента задачи: комментарии + автолог изменений (этап/приоритет/исполнитель/
 * срок — пишутся автоматически из PATCH /api/tasks/[id]). Комментировать и
 * читать может любой участник пространства, где лежит доска задачи — как и
 * остальные действия с задачами в этом приложении, права не завязаны на
 * членство в конкретной доске.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const task = await getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  }
  const board = await getBoard(task.boardId);
  if (!board || !(await canAccessWorkspace(user, board.workspaceId))) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  const events = await listTaskEvents(id);
  return NextResponse.json({ events });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const task = await getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  }
  const board = await getBoard(task.boardId);
  if (!board || !(await canAccessWorkspace(user, board.workspaceId))) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createTaskEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const event = await createTaskEvent({
    taskId: id,
    type: "comment",
    authorEmail: user.email,
    body: parsed.data.body,
  });

  // Уведомляем «другую сторону» задачи — если комментирует исполнитель,
  // сообщаем постановщику и наоборот; если оба разные от автора — обоим.
  const recipients = new Set(
    [...task.assigneeEmails, task.createdBy].filter(
      (e): e is string => Boolean(e) && e !== user.email,
    ),
  );
  for (const recipient of recipients) {
    after(() =>
      notify({
        userEmail: recipient,
        type: "task_comment",
        title: `${user.name} прокомментировал(а) задачу`,
        body: `${task.title}: ${parsed.data.body}`,
        link: `/w/${board.workspaceId}/boards/${board.id}`,
        telegramText: `💬 <b>${escapeHtml(user.name)}</b> прокомментировал(а) задачу «${escapeHtml(task.title)}»:\n${escapeHtml(parsed.data.body)}`,
        telegramKeyboard: [[{ text: "Открыть", url: boardDeepLink(board.workspaceId, board.id) }]],
        prefKey: "notifyComments",
      }),
    );
  }

  return NextResponse.json({ event }, { status: 201 });
}
