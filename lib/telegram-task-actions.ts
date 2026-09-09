import "server-only";
import {
  deleteTask,
  deleteTelegramDraft,
  getBoard,
  getTask,
  getTelegramDraft,
  getUserByEmail,
  startTelegramDraft,
  updateTask,
} from "@/lib/data";
import {
  answerCallbackQuery,
  sendMessage,
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
 *   tcet: — изменить название
 *   tced: — изменить описание
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

/**
 * Управлять задачей (правка, архив, удаление) может её постановщик или
 * администратор. У старых задач автор мог не сохраниться — тогда доступ
 * открыт всем, как и в приложении. Админ нужен не для галочки: у человека
 * может быть два аккаунта, а коллега — уйти из команды, и его задачи иначе
 * оставались бы неудаляемыми навсегда.
 */
async function canManage(task: Task, email: string): Promise<boolean> {
  if (!task.createdBy || task.createdBy === email) return true;
  const user = await getUserByEmail(email);
  return user?.role === "admin";
}

function backRow(list: TaskCardList, offset: number): InlineButton[] {
  return [{ text: "← К списку", callback_data: `${list}:${offset}` }];
}

async function buildCard(
  task: Task,
  email: string,
  list: TaskCardList,
  offset: number,
): Promise<{ text: string; keyboard: InlineButton[][] }> {
  const board = await getBoard(task.boardId);
  const assigneeNames = await Promise.all(
    task.assigneeEmails.map(async (email) => (await getUserByEmail(email))?.name ?? email),
  );

  const lines = [
    `<b>${escapeHtml(task.title)}</b>`,
    ...(task.description ? [escapeHtml(task.description)] : []),
    "",
    `Доска: ${escapeHtml(board?.name ?? "—")}`,
    `Этап: ${escapeHtml(label(STAGES, task.stage))}`,
    `Вид: ${escapeHtml(label(TASK_KINDS, task.kind))} · Приоритет: ${escapeHtml(label(PRIORITIES, task.priority))}`,
    `${assigneeNames.length > 1 ? "Исполнители" : "Исполнитель"}: ${escapeHtml(
      assigneeNames.length > 0 ? assigneeNames.join(", ") : "не назначен",
    )}`,
    `Срок: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString("ru-RU") : "без срока"}`,
  ];

  const keyboard: InlineButton[][] = [];
  if (board) {
    keyboard.push([{ text: "Открыть", url: boardDeepLink(board.workspaceId, board.id) }]);
  }
  if (await canManage(task, email)) {
    keyboard.push([
      { text: "✏️ Название", callback_data: `tcet:${list}:${offset}:${task.id}` },
      { text: "✏️ Описание", callback_data: `tced:${list}:${offset}:${task.id}` },
    ]);
    keyboard.push([
      { text: "📦 В архив", callback_data: `tca:${list}:${offset}:${task.id}` },
      { text: "🗑 Удалить", callback_data: `tcdq:${list}:${offset}:${task.id}` },
    ]);
  }
  keyboard.push(backRow(list, offset));

  return { text: lines.join("\n"), keyboard };
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
  if (!/^(tc|tca|tcdq|tcd|tcet|tced):/.test(data)) return false;

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
    const card = await buildCard(task, email, list, offset);
    await editMessageText(chatId, messageId, card.text, { keyboard: card.keyboard });
    return true;
  }

  if (!(await canManage(task, email))) {
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

  if (action === "tcet" || action === "tced") {
    const field = action === "tcet" ? "название" : "описание";
    await startTelegramDraft({
      chatId,
      email,
      step: action === "tcet" ? "edit_title" : "edit_description",
      editingTaskId: task.id,
    });
    await answerCallbackQuery(callbackQueryId);
    await editMessageText(
      chatId,
      messageId,
      `✏️ <b>${escapeHtml(task.title)}</b>\n\nПришлите новое ${field} одним сообщением.${
        action === "tced" ? "\nЧтобы стереть описание, отправьте «-»." : ""
      }`,
      { keyboard: [[{ text: "Отмена", callback_data: `tc:${list}:${offset}:${task.id}` }]] },
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

/**
 * Текстовое сообщение как шаг правки задачи из карточки. Возвращает true,
 * если сообщение относилось к правке — тогда вебхук не разбирает его дальше
 * (ни как шаг /newtask, ни как команду).
 */
export async function handleTaskEditText(
  chatId: string,
  email: string,
  text: string,
): Promise<boolean> {
  const draft = await getTelegramDraft(chatId);
  if (!draft || !draft.editingTaskId) return false;
  if (draft.step !== "edit_title" && draft.step !== "edit_description") return false;

  const task = await getTask(draft.editingTaskId);
  if (!task) {
    await deleteTelegramDraft(chatId);
    await sendMessage(chatId, "Задача не найдена — возможно, её уже удалили.");
    return true;
  }
  if (!(await canManage(task, email))) {
    await deleteTelegramDraft(chatId);
    await sendMessage(chatId, "Менять задачу может только тот, кто её поставил, или администратор.");
    return true;
  }

  const value = text.trim();
  if (draft.step === "edit_title") {
    if (value.length < 3) {
      await sendMessage(chatId, "Слишком короткое название — от 3 символов.");
      return true;
    }
    await updateTask(task.id, { title: value.slice(0, 200) });
  } else {
    // «-» — способ стереть описание: пустое сообщение Telegram просто не пришлёт.
    await updateTask(task.id, { description: value === "-" ? "" : value.slice(0, 2000) });
  }

  await deleteTelegramDraft(chatId);
  const updated = await getTask(task.id);
  if (!updated) return true;

  // Карточку показываем новым сообщением: пользователь только что написал
  // в чат, старое сообщение карточки уехало вверх.
  const card = await buildCard(updated, email, "ag", 0);
  await sendMessage(chatId, `✅ Сохранено\n\n${card.text}`, { keyboard: card.keyboard });
  return true;
}
