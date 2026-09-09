import "server-only";
import {
  createTask,
  createTaskEvent,
  deleteTelegramDraft,
  getBoard,
  getTelegramDraft,
  getUserByEmail,
  listBoards,
  listWorkspaceMemberEmails,
  listWorkspacesForUser,
  startTelegramDraft,
  updateTelegramDraft,
} from "@/lib/data";
import {
  answerCallbackQuery,
  boardDeepLink,
  editMessageText,
  escapeHtml,
  sendMessage,
  type InlineButton,
} from "@/lib/telegram";
import { notify } from "@/lib/notifications";
import { PRIORITIES, TASK_KINDS } from "@/lib/schema";
import type { TelegramDraft } from "@/lib/models";

/**
 * Пошаговое создание задачи прямо в чате бота (/newtask).
 *
 * Состояние диалога живёт в хранилище (telegram_drafts), а не в памяти
 * процесса: на Vercel каждый апдейт Telegram может обработать свой экземпляр
 * serverless-функции. Сама задача создаётся той же функцией `createTask` из
 * lib/data.ts, что и в POST /api/tasks — логика создания не дублируется,
 * публичный контракт эндпоинтов не трогается.
 *
 * Префиксы callback_data этого диалога:
 *   nt_ws:<workspaceId>   — выбор пространства
 *   nt_bd:<boardId>       — выбор доски
 *   nt_desc:skip          — пропустить описание
 *   nt_kind:<id>          — вид задачи
 *   nt_prio:<id>          — приоритет
 *   nt_as:self|none|<i>   — выбор исполнителя (i — индекс в отсортированном
 *                           списке участников: email в callback_data может
 *                           не поместиться в лимит Telegram в 64 байта)
 *   nt_due:<preset>       — срок кнопкой (today|tomorrow|3d|none|custom)
 *   cal:YYYY-MM-DD        — выбор дня в инлайн-календаре
 *   cal_nav:YYYY-MM       — переключение месяца в календаре
 *   nt_cancel             — отмена диалога
 *   nt_noop               — «мёртвые» кнопки календаря (шапка дней недели, пустые клетки)
 */

/** Кнопка в постоянном меню бота (MAIN_MENU в webhook/route.ts). */
export const NEWTASK_BUTTON = "➕ Новая задача";

const RU_MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const RU_WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const CANCEL_ROW: InlineButton[] = [{ text: "✖️ Отмена", callback_data: "nt_cancel" }];

/**
 * Срок ставим на конец выбранного дня, а не на полночь — иначе задача «на
 * сегодня» сразу считалась бы просроченной (isOverdue сравнивает dueDate с
 * текущим моментом, см. lib/task-sort.ts).
 */
function endOfDayIso(date: Date): string {
  const d = new Date(date);
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

function formatDue(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("ru-RU") : "без срока";
}

/** Обрезает текст под лимит подписи кнопки Telegram (64 символа). */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Отправляет новое сообщение либо правит существующее — чтобы шаги диалога не плодили сообщения в чате. */
async function show(
  chatId: string,
  messageId: number | undefined,
  text: string,
  keyboard: InlineButton[][],
): Promise<void> {
  if (messageId) {
    await editMessageText(chatId, messageId, text, { keyboard });
  } else {
    await sendMessage(chatId, text, { keyboard });
  }
}

// ---------- Шаги диалога ----------

/** Точка входа: /newtask или кнопка «Новая задача». */
export async function startNewTaskDialog(chatId: string, email: string): Promise<void> {
  const workspaces = await listWorkspacesForUser(email);
  if (workspaces.length === 0) {
    await sendMessage(
      chatId,
      "Вы пока не состоите ни в одном пространстве — попросите администратора добавить вас, и задачи можно будет создавать прямо здесь.",
    );
    return;
  }

  // Одно пространство — шаг выбора не нужен, сразу переходим к доскам.
  if (workspaces.length === 1) {
    const draft = await startTelegramDraft({
      chatId,
      email,
      step: "board",
      workspaceId: workspaces[0].id,
    });
    await promptBoard(chatId, draft, undefined);
    return;
  }

  await startTelegramDraft({ chatId, email, step: "workspace" });
  const rows: InlineButton[][] = workspaces.map((ws) => [
    { text: truncate(ws.name, 60), callback_data: `nt_ws:${ws.id}` },
  ]);
  await sendMessage(chatId, "<b>Новая задача</b>\n\nВ каком пространстве создаём?", {
    keyboard: [...rows, CANCEL_ROW],
  });
}

async function promptBoard(
  chatId: string,
  draft: TelegramDraft,
  messageId: number | undefined,
): Promise<void> {
  const boards = await listBoards(draft.workspaceId!);
  if (boards.length === 0) {
    await deleteTelegramDraft(chatId);
    await show(
      chatId,
      messageId,
      "В этом пространстве ещё нет ни одной доски. Создайте её в приложении — и возвращайтесь.",
      [],
    );
    return;
  }

  // Одна доска — шаг выбора пропускаем, как и с единственным пространством.
  if (boards.length === 1) {
    const next = await updateTelegramDraft(chatId, { step: "title", boardId: boards[0].id });
    if (next) await promptTitle(chatId, next, messageId);
    return;
  }

  const rows: InlineButton[][] = boards.map((board) => [
    { text: truncate(board.name, 60), callback_data: `nt_bd:${board.id}` },
  ]);
  await show(chatId, messageId, "<b>Новая задача</b>\n\nНа какой доске?", [...rows, CANCEL_ROW]);
}

async function promptTitle(
  chatId: string,
  draft: TelegramDraft,
  messageId: number | undefined,
): Promise<void> {
  const board = await getBoard(draft.boardId!);
  await show(
    chatId,
    messageId,
    `<b>Новая задача</b>\nДоска: ${escapeHtml(board?.name ?? "—")}\n\nПришлите текст задачи одним сообщением.`,
    [CANCEL_ROW],
  );
}

async function promptDescription(
  chatId: string,
  draft: TelegramDraft,
  messageId: number | undefined,
): Promise<void> {
  await show(
    chatId,
    messageId,
    `<b>Новая задача</b>\n«${escapeHtml(draft.title ?? "")}»\n\nПришлите описание одним сообщением — или пропустите этот шаг.`,
    [[{ text: "Пропустить", callback_data: "nt_desc:skip" }], CANCEL_ROW],
  );
}

async function promptKind(
  chatId: string,
  draft: TelegramDraft,
  messageId: number | undefined,
): Promise<void> {
  await show(
    chatId,
    messageId,
    `<b>Новая задача</b>\n«${escapeHtml(draft.title ?? "")}»\n\nКакой вид задачи?`,
    [...TASK_KINDS.map((kind) => [{ text: kind.label, callback_data: `nt_kind:${kind.id}` }]), CANCEL_ROW],
  );
}

async function promptPriority(
  chatId: string,
  draft: TelegramDraft,
  messageId: number | undefined,
): Promise<void> {
  // Приоритеты по двое в ряд — четыре кнопки в столбик занимали бы пол-экрана.
  const rows: InlineButton[][] = [];
  for (let i = 0; i < PRIORITIES.length; i += 2) {
    rows.push(
      PRIORITIES.slice(i, i + 2).map((p) => ({ text: p.label, callback_data: `nt_prio:${p.id}` })),
    );
  }
  await show(
    chatId,
    messageId,
    `<b>Новая задача</b>\n«${escapeHtml(draft.title ?? "")}»\n\nКакой приоритет?`,
    [...rows, CANCEL_ROW],
  );
}

/**
 * Участники в кнопках идут по отсортированному списку email — тот же порядок
 * восстанавливается при обработке нажатия, поэтому в callback_data достаточно
 * индекса (email мог бы не поместиться в лимит 64 байта).
 */
async function sortedMembers(workspaceId: string): Promise<string[]> {
  const emails = await listWorkspaceMemberEmails(workspaceId);
  return [...emails].sort();
}

async function promptAssignee(
  chatId: string,
  draft: TelegramDraft,
  messageId: number | undefined,
): Promise<void> {
  const members = await sortedMembers(draft.workspaceId!);
  const rows: InlineButton[][] = [[{ text: "🙋 На себя", callback_data: "nt_as:self" }]];

  for (const [index, memberEmail] of members.entries()) {
    if (memberEmail === draft.email) continue;
    const user = await getUserByEmail(memberEmail);
    rows.push([
      { text: truncate(user?.name ?? memberEmail, 60), callback_data: `nt_as:${index}` },
    ]);
  }

  rows.push([{ text: "— Без исполнителя", callback_data: "nt_as:none" }]);
  rows.push(CANCEL_ROW);

  await show(
    chatId,
    messageId,
    `<b>Новая задача</b>\n«${escapeHtml(draft.title ?? "")}»\n\nКому назначаем?`,
    rows,
  );
}

async function promptDue(
  chatId: string,
  draft: TelegramDraft,
  messageId: number | undefined,
): Promise<void> {
  const assigneeLabel = draft.assigneeEmail
    ? ((await getUserByEmail(draft.assigneeEmail))?.name ?? draft.assigneeEmail)
    : "без исполнителя";

  await show(
    chatId,
    messageId,
    `<b>Новая задача</b>\n«${escapeHtml(draft.title ?? "")}»\nИсполнитель: ${escapeHtml(assigneeLabel)}\n\nКакой срок?`,
    [
      [
        { text: "Сегодня", callback_data: "nt_due:today" },
        { text: "Завтра", callback_data: "nt_due:tomorrow" },
      ],
      [
        { text: "Через 3 дня", callback_data: "nt_due:3d" },
        { text: "Без срока", callback_data: "nt_due:none" },
      ],
      [{ text: "📅 Другая дата", callback_data: "nt_due:custom" }],
      CANCEL_ROW,
    ],
  );
}

// ---------- Инлайн-календарь ----------

function monthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function parseMonthKey(key: string): { year: number; monthIndex: number } {
  const [yearStr, monthStr] = key.split("-");
  return { year: Number(yearStr), monthIndex: Number(monthStr) - 1 };
}

/**
 * Сетка месяца: шапка с днями недели (Пн…Вс), числа кнопками, снизу —
 * переключение месяцев. Неделя начинается с понедельника, поэтому воскресенье
 * (getDay() === 0) сдвигаем в конец.
 */
function buildCalendar(key: string, title: string): { text: string; keyboard: InlineButton[][] } {
  const { year, monthIndex } = parseMonthKey(key);
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leading = (first.getDay() + 6) % 7;

  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === monthIndex;

  const keyboard: InlineButton[][] = [
    RU_WEEKDAYS.map((label) => ({ text: label, callback_data: "nt_noop" })),
  ];

  const cells: InlineButton[] = [];
  for (let i = 0; i < leading; i++) {
    cells.push({ text: " ", callback_data: "nt_noop" });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = isCurrentMonth && today.getDate() === day;
    cells.push({
      text: isToday ? `·${day}·` : String(day),
      callback_data: `cal:${key}-${String(day).padStart(2, "0")}`,
    });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ text: " ", callback_data: "nt_noop" });
  }
  for (let i = 0; i < cells.length; i += 7) {
    keyboard.push(cells.slice(i, i + 7));
  }

  const prev = new Date(year, monthIndex - 1, 1);
  const next = new Date(year, monthIndex + 1, 1);
  keyboard.push([
    { text: "← Пред. месяц", callback_data: `cal_nav:${monthKey(prev.getFullYear(), prev.getMonth())}` },
    { text: "След. месяц →", callback_data: `cal_nav:${monthKey(next.getFullYear(), next.getMonth())}` },
  ]);
  keyboard.push(CANCEL_ROW);

  return { text: `${title}\n\n<b>${RU_MONTHS[monthIndex]} ${year}</b>\nВыберите дату:`, keyboard };
}

function calendarTitle(draft: TelegramDraft): string {
  return `<b>Новая задача</b>\n«${escapeHtml(draft.title ?? "")}»`;
}

// ---------- Создание задачи ----------

/**
 * Финальный шаг: создаём задачу тем же `createTask`, что и POST /api/tasks
 * (stage выставляется в первый этап внутри store-слоя), пишем событие
 * «создана» в историю и, если исполнитель не сам автор, шлём ему уведомление
 * через общий notify() — формат сообщения тот же, что в app/api/tasks/route.ts.
 */
async function finishDraft(
  chatId: string,
  draft: TelegramDraft,
  messageId: number | undefined,
): Promise<void> {
  const board = await getBoard(draft.boardId!);
  if (!board) {
    await deleteTelegramDraft(chatId);
    await show(chatId, messageId, "Доска не найдена — возможно, её удалили. Начните заново: /newtask", []);
    return;
  }

  const author = await getUserByEmail(draft.email);
  const task = await createTask({
    boardId: board.id,
    title: draft.title!,
    description: draft.description ?? "",
    priority: draft.priority ?? "medium",
    kind: draft.kind ?? "normal",
    assigneeEmail: draft.assigneeEmail,
    dueDate: draft.dueDate,
    createdBy: draft.email,
  });
  await createTaskEvent({ taskId: task.id, type: "created", authorEmail: draft.email });
  await deleteTelegramDraft(chatId);

  if (task.assigneeEmail && task.assigneeEmail !== draft.email) {
    await notify({
      userEmail: task.assigneeEmail,
      type: "task_assigned",
      title: `${author?.name ?? draft.email} назначил(а) вам задачу`,
      body: task.title,
      link: `/w/${board.workspaceId}/boards/${board.id}`,
      telegramText: `📋 <b>${escapeHtml(author?.name ?? draft.email)}</b> назначил(а) вам задачу:\n<b>${escapeHtml(task.title)}</b>${
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
    });
  }

  const assigneeLabel = task.assigneeEmail
    ? ((await getUserByEmail(task.assigneeEmail))?.name ?? task.assigneeEmail)
    : "не назначен";

  const kindLabel = TASK_KINDS.find((k) => k.id === task.kind)?.label ?? task.kind;
  const priorityLabel = PRIORITIES.find((p) => p.id === task.priority)?.label ?? task.priority;

  await show(
    chatId,
    messageId,
    [
      "✅ <b>Задача создана</b>",
      "",
      `<b>${escapeHtml(task.title)}</b>`,
      ...(task.description ? [escapeHtml(task.description)] : []),
      "",
      `Доска: ${escapeHtml(board.name)}`,
      `Вид: ${escapeHtml(kindLabel)} · Приоритет: ${escapeHtml(priorityLabel)}`,
      `Исполнитель: ${escapeHtml(assigneeLabel)}`,
      `Срок: ${formatDue(task.dueDate)}`,
    ].join("\n"),
    [[{ text: "Открыть", url: boardDeepLink(board.workspaceId, board.id) }]],
  );
}

// ---------- Обработчики апдейтов ----------

/**
 * Обрабатывает обычное текстовое сообщение как шаг диалога. Возвращает true,
 * если сообщение было частью /newtask — тогда вебхук не пытается разобрать
 * его как команду.
 */
export async function handleNewTaskText(chatId: string, text: string): Promise<boolean> {
  const draft = await getTelegramDraft(chatId);
  if (!draft) return false;

  if (draft.step === "title") {
    const title = text.trim();
    if (title.length < 3) {
      await sendMessage(chatId, "Слишком короткий текст — напишите задачу подробнее (от 3 символов).");
      return true;
    }
    const next = await updateTelegramDraft(chatId, {
      step: "description",
      title: title.slice(0, 200),
    });
    if (next) await promptDescription(chatId, next, undefined);
    return true;
  }

  if (draft.step === "description") {
    const next = await updateTelegramDraft(chatId, {
      step: "kind",
      // 2000 — тот же предел, что и у описания в форме приложения (lib/validation.ts).
      description: text.trim().slice(0, 2000),
    });
    if (next) await promptKind(chatId, next, undefined);
    return true;
  }

  return false;
}

/**
 * Обрабатывает нажатие инлайн-кнопки диалога. Возвращает true, если callback
 * относился к /newtask — тогда вебхук не проверяет остальные префиксы.
 */
export async function handleNewTaskCallback(input: {
  callbackQueryId: string;
  chatId: string;
  messageId?: number;
  data: string;
}): Promise<boolean> {
  const { callbackQueryId, chatId, messageId, data } = input;
  const isOurs =
    data === "nt_cancel" ||
    data === "nt_noop" ||
    data.startsWith("nt_ws:") ||
    data.startsWith("nt_bd:") ||
    data.startsWith("nt_desc:") ||
    data.startsWith("nt_kind:") ||
    data.startsWith("nt_prio:") ||
    data.startsWith("nt_as:") ||
    data.startsWith("nt_due:") ||
    data.startsWith("cal:") ||
    data.startsWith("cal_nav:");
  if (!isOurs) return false;

  if (data === "nt_noop") {
    await answerCallbackQuery(callbackQueryId);
    return true;
  }

  if (data === "nt_cancel") {
    await deleteTelegramDraft(chatId);
    await answerCallbackQuery(callbackQueryId, "Отменено");
    if (messageId) await editMessageText(chatId, messageId, "Создание задачи отменено.");
    return true;
  }

  const draft = await getTelegramDraft(chatId);
  if (!draft) {
    await answerCallbackQuery(callbackQueryId, "Диалог устарел — начните заново: /newtask");
    return true;
  }

  if (data.startsWith("nt_ws:")) {
    const workspaceId = data.slice("nt_ws:".length);
    const next = await updateTelegramDraft(chatId, { step: "board", workspaceId });
    await answerCallbackQuery(callbackQueryId);
    if (next) await promptBoard(chatId, next, messageId);
    return true;
  }

  if (data.startsWith("nt_bd:")) {
    const boardId = data.slice("nt_bd:".length);
    const next = await updateTelegramDraft(chatId, { step: "title", boardId });
    await answerCallbackQuery(callbackQueryId);
    if (next) await promptTitle(chatId, next, messageId);
    return true;
  }

  if (data === "nt_desc:skip") {
    const next = await updateTelegramDraft(chatId, { step: "kind", description: null });
    await answerCallbackQuery(callbackQueryId);
    if (next) await promptKind(chatId, next, messageId);
    return true;
  }

  if (data.startsWith("nt_kind:")) {
    const kind = data.slice("nt_kind:".length) as TelegramDraft["kind"];
    const next = await updateTelegramDraft(chatId, { step: "priority", kind });
    await answerCallbackQuery(callbackQueryId);
    if (next) await promptPriority(chatId, next, messageId);
    return true;
  }

  if (data.startsWith("nt_prio:")) {
    const priority = data.slice("nt_prio:".length) as TelegramDraft["priority"];
    const next = await updateTelegramDraft(chatId, { step: "assignee", priority });
    await answerCallbackQuery(callbackQueryId);
    if (next) await promptAssignee(chatId, next, messageId);
    return true;
  }

  if (data.startsWith("nt_as:")) {
    const value = data.slice("nt_as:".length);
    let assigneeEmail: string | null = null;
    if (value === "self") {
      assigneeEmail = draft.email;
    } else if (value !== "none") {
      const members = await sortedMembers(draft.workspaceId!);
      assigneeEmail = members[Number(value)] ?? null;
    }
    const next = await updateTelegramDraft(chatId, { step: "due", assigneeEmail });
    await answerCallbackQuery(callbackQueryId);
    if (next) await promptDue(chatId, next, messageId);
    return true;
  }

  if (data.startsWith("nt_due:")) {
    const preset = data.slice("nt_due:".length);

    if (preset === "custom") {
      const now = new Date();
      const key = monthKey(now.getFullYear(), now.getMonth());
      const next = await updateTelegramDraft(chatId, {
        step: "calendar",
        calendarMonth: key,
        calendarMessageId: messageId ?? null,
      });
      await answerCallbackQuery(callbackQueryId);
      if (next) {
        const { text, keyboard } = buildCalendar(key, calendarTitle(next));
        await show(chatId, messageId, text, keyboard);
      }
      return true;
    }

    const now = new Date();
    let dueDate: string | null = null;
    if (preset === "today") {
      dueDate = endOfDayIso(now);
    } else if (preset === "tomorrow") {
      now.setDate(now.getDate() + 1);
      dueDate = endOfDayIso(now);
    } else if (preset === "3d") {
      now.setDate(now.getDate() + 3);
      dueDate = endOfDayIso(now);
    }

    await answerCallbackQuery(callbackQueryId);
    await finishDraft(chatId, { ...draft, dueDate }, messageId);
    return true;
  }

  if (data.startsWith("cal_nav:")) {
    const key = data.slice("cal_nav:".length);
    const next = await updateTelegramDraft(chatId, { calendarMonth: key });
    await answerCallbackQuery(callbackQueryId);
    if (next) {
      const { text, keyboard } = buildCalendar(key, calendarTitle(next));
      // Тот же message_id — календарь перерисовывается на месте.
      await show(chatId, messageId ?? next.calendarMessageId ?? undefined, text, keyboard);
    }
    return true;
  }

  if (data.startsWith("cal:")) {
    const [yearStr, monthStr, dayStr] = data.slice("cal:".length).split("-");
    const picked = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
    await answerCallbackQuery(callbackQueryId, `Срок: ${picked.toLocaleDateString("ru-RU")}`);
    // Выбор дня — сразу следующий шаг, как и обычная кнопка срока.
    await finishDraft(chatId, { ...draft, dueDate: endOfDayIso(picked) }, messageId);
    return true;
  }

  return false;
}
