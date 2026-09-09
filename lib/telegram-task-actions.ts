import "server-only";
import { deleteTask, getBoard, getTask, getUserByEmail, updateTask } from "@/lib/data";
import {
  answerCallbackQuery,
  boardDeepLink,
  editMessageText,
  escapeHtml,
  type InlineButton,
} from "@/lib/telegram";
import { PRIORITIES, STAGES, TASK_KINDS } from "@/lib/schema";
import type { Task } from "@/lib/models";

/**
 * Карточка действий по одной задаче: открывается кнопкой «⚙️» из списков
 * /mytasks, /today и /assigned. Отсюда задачу можно убрать в архив или
 * удалить — то же, что и в приложении, включая правило «управляет тот, кто
 * задачу поставил».
 *
 * Формат callback_data — `<действие>:<список>:<смещение>:<taskId>`. Список и
 * смещение носим с собой, чтобы кнопка «К списку» вернула ровно ту страницу,
 * с которой пользователь пришёл (у самих списков префиксы mt/td/ag уже есть).
 *
 *   tc:   — открыть карточку
 *   tca:  — убрать в архив
 *   tcdq: — спросить подтверждение удаления
 *   tcd:  — удалить окончательно
 */
export type TaskCardList = "mt" | "td" | "ag";

/** Кнопка «⚙️» рядом с задачей в списке. */
export function taskCardButton(list: TaskCardList, offset: number, taskId: string, text = "⚙️"): InlineButton {
  return { text, callback_data: `tc:${list}:${offset}:${taskId}` };
}

function parse(data: string): { action: string; list: TaskCardList; offset: number; taskId: string } | null {
  const [action, list, offsetStr, taskId] = data.split(":");
  if (!action || !list || !taskId) return null;
  return { action, list: list as TaskCardList, offset: Number(offsetStr) || 0, taskId };
}

function label(collection: readonly { id: string; label: string }[], id: string): string {
  return collection.find((item) => item.id === id)?.label ?? id;
}

/** Управлять задачей (архив, удаление) может её постановщик; у старых задач автор мог не сохраниться — тогда доступ открыт всем, как и в приложении. */
function canManage(task: Task, email: string): boolean {
  return !task.createdBy || task.createdBy === email;
}

function backRow(list: TaskCardList, offset: number): InlineButton[] {
  return [{ text: "← К списку", callback_data: `${list}:${offset}` }];
}

async function renderCard(
  chatId: string,
  messageId: number,
  task: Task,
  email: string,
  list: TaskCardList,
  offset: number,
): Promise<void> {
  const board = await getBoard(task.boardId);
  const assignee = task.assigneeEmail ? await getUserByEmail(task.assigneeEmail) : undefined;

  const lines = [
    `<b>${escapeHtml(task.title)}</b>`,
    ...(task.description ? [escapeHtml(task.description)] : []),
    "",
    `Доска: ${escapeHtml(board?.name ?? "—")}`,
    `Этап: ${escapeHtml(label(STAGES, task.stage))}`,
    `Вид: ${escapeHtml(label(TASK_KINDS, task.kind))} · Приоритет: ${escapeHtml(label(PRIORITIES, task.priority))}`,
    `Исполнитель: ${escapeHtml(
      task.assigneeEmail ? (assignee?.name ?? task.assigneeEmail) : "не назначен",
    )}`,
    `Срок: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString("ru-RU") : "без срока"}`,
  ];

  const keyboard: InlineButton[][] = [];
  if (board) {
    keyboard.push([{ text: "Открыть", url: boardDeepLink(board.workspaceId, board.id) }]);
  }
  if (canManage(task, email)) {
    keyboard.push([
      { text: "📦 В архив", callback_data: `tca:${list}:${offset}:${task.id}` },
      { text: "🗑 Удалить", callback_data: `tcdq:${list}:${offset}:${task.id}` },
    ]);
  }
  keyboard.push(backRow(list, offset));

  await editMessageText(chatId, messageId, lines.join("\n"), { keyboard });
}

/**
 * Разбирает нажатия кнопок карточки. Возвращает true, если callback был её —
 * тогда вебхук не проверяет остальные префиксы.
 */
export async function handleTaskCardCallback(input: {
  callbackQueryId: string;
  chatId: string;
  messageId?: number;
  email: string;
  data: string;
}): Promise<boolean> {
  const { callbackQueryId, chatId, messageId, email, data } = input;
  if (!/^(tc|tca|tcdq|tcd):/.test(data)) return false;

  const parsed = parse(data);
  if (!parsed || !messageId) {
    await answerCallbackQuery(callbackQueryId);
    return true;
  }
  const { action, list, offset, taskId } = parsed;

  const task = await getTask(taskId);
  if (!task) {
    await answerCallbackQuery(callbackQueryId, "Задача не найдена");
    await editMessageText(chatId, messageId, "Задача не найдена — возможно, её уже удалили.", {
      keyboard: [backRow(list, offset)],
    });
    return true;
  }

  if (action === "tc") {
    await answerCallbackQuery(callbackQueryId);
    await renderCard(chatId, messageId, task, email, list, offset);
    return true;
  }

  if (!canManage(task, email)) {
    await answerCallbackQuery(callbackQueryId, "Управлять задачей может только тот, кто её поставил");
    return true;
  }

  if (action === "tca") {
    await updateTask(taskId, { archivedAt: new Date().toISOString() });
    await answerCallbackQuery(callbackQueryId, "Убрано в архив 📦");
    await editMessageText(
      chatId,
      messageId,
      `📦 <b>${escapeHtml(task.title)}</b>\n\nЗадача в архиве. Вернуть её можно в приложении — кнопка «Архив» над доской.`,
      { keyboard: [backRow(list, offset)] },
    );
    return true;
  }

  // Удаление необратимо, поэтому сначала переспрашиваем — как и в приложении.
  if (action === "tcdq") {
    await answerCallbackQuery(callbackQueryId);
    await editMessageText(
      chatId,
      messageId,
      `🗑 Удалить задачу <b>${escapeHtml(task.title)}</b>?\n\nВосстановить не получится. Если задача может ещё понадобиться — уберите её в архив.`,
      {
        keyboard: [
          [
            { text: "Да, удалить", callback_data: `tcd:${list}:${offset}:${task.id}` },
            { text: "Отмена", callback_data: `tc:${list}:${offset}:${task.id}` },
          ],
          backRow(list, offset),
        ],
      },
    );
    return true;
  }

  if (action === "tcd") {
    await deleteTask(taskId);
    await answerCallbackQuery(callbackQueryId, "Удалено 🗑");
    await editMessageText(chatId, messageId, `🗑 Задача <b>${escapeHtml(task.title)}</b> удалена.`, {
      keyboard: [backRow(list, offset)],
    });
    return true;
  }

  return false;
}
