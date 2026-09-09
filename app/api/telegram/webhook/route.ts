import { NextRequest, NextResponse } from "next/server";
import {
  consumeTelegramLinkToken,
  createMessage,
  deleteTelegramLink,
  getQuestion,
  getTask,
  getUserByEmail,
  getTelegramLinkByChatId,
  listMyTasksInWorkspace,
  listQuestionsForUser,
  listWorkspacesForUser,
  setTelegramLink,
  updateTask,
} from "@/lib/data";
import {
  answerCallbackQuery,
  boardDeepLink,
  editMessageReplyMarkup,
  editMessageText,
  escapeHtml,
  questionsDeepLink,
  sendMessage,
  type InlineButton,
  type ReplyKeyboard,
} from "@/lib/telegram";
import { notify } from "@/lib/notifications";
import { handleAssignedByMe, handleAssignedPage } from "@/lib/telegram-assigned";
import {
  handleTaskCardCallback,
  handleTaskEditText,
  taskCardButton,
} from "@/lib/telegram-task-actions";
import {
  NEWTASK_BUTTON,
  handleNewTaskCallback,
  handleNewTaskText,
  startNewTaskDialog,
} from "@/lib/telegram-newtask";
import { isDueToday, isOverdue } from "@/lib/task-sort";
import type { TaskWithBoard } from "@/lib/models";

/**
 * Вебхук Telegram-бота @diytask_tracker_bot. URL регистрируется один раз
 * через scripts/set-telegram-webhook.ts (там же — регистрация команд
 * /setMyCommands). Секрет заголовка (X-Telegram-Bot-Api-Secret-Token)
 * подтверждает, что запрос пришёл от Telegram, а не от кого-то ещё, кто
 * угадал наш URL — задаётся TELEGRAM_WEBHOOK_SECRET.
 */
export const dynamic = "force-dynamic";

const HELP_TEXT = [
  "<b>Команды бота «Пульс»</b>",
  "/newtask — создать задачу, не заходя в приложение: бот по шагам спросит доску, текст, исполнителя и срок (можно выбрать дату в календаре)",
  "/mytasks — мои активные задачи",
  "/assigned — задачи, которые я поручил другим: кому, когда поставлена и какой срок",
  "/today — что горит сегодня и просрочено",
  "/questions — открытые вопросы, где я участник",
  "/unlink — отвязать этот аккаунт от бота",
  "/help — это сообщение",
  "",
  "Кнопки внизу экрана дублируют основные команды.",
].join("\n");

/** Постоянное меню внизу чата — открывается один раз после привязки и остаётся, пока бот не отвязан. */
const MAIN_MENU: ReplyKeyboard = [
  [{ text: NEWTASK_BUTTON }],
  [{ text: "📋 Мои задачи" }, { text: "📤 Я поручил" }],
  [{ text: "🔥 Сегодня" }, { text: "❓ Вопросы" }],
  [{ text: "❔ Помощь" }],
];

/**
 * Тексты кнопок постоянного меню — приходят как обычные сообщения. Нужны,
 * чтобы отличить нажатие кнопки от текста, который пользователь вводит как
 * шаг диалога /newtask (например, заголовок задачи).
 */
const MENU_TEXTS = new Set(MAIN_MENU.flat().map((button) => button.text.toLowerCase()));

const PAGE_SIZE = 8;

/** Обрезает длинный заголовок задачи для текста кнопки (лимит Telegram — 64 символа). */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatTaskLine(task: TaskWithBoard, workspaceId: string): string {
  const now = new Date();
  const due = task.dueDate ? new Date(task.dueDate).toLocaleDateString("ru-RU") : null;
  let dueLabel = "без срока";
  if (due) {
    dueLabel = isOverdue(task, now) ? `⚠️ просрочено (${due})` : isDueToday(task, now) ? `сегодня` : `до ${due}`;
  }
  return `• <b>${escapeHtml(task.title)}</b> — ${escapeHtml(task.boardName)}, ${dueLabel}\n  <a href="${boardDeepLink(workspaceId, task.boardId)}">Открыть</a>`;
}

async function collectMyTasks(email: string): Promise<{ task: TaskWithBoard; workspaceId: string }[]> {
  const workspaces = await listWorkspacesForUser(email);
  const all: { task: TaskWithBoard; workspaceId: string }[] = [];
  for (const ws of workspaces) {
    const tasks = await listMyTasksInWorkspace(ws.id, email);
    for (const task of tasks) {
      if (task.stage !== "done") all.push({ task, workspaceId: ws.id });
    }
  }
  return all;
}

/** Строит текст+клавиатуру одной страницы списка задач — используется и для первой отправки, и для «Ещё →» через editMessageText. */
function buildTasksPage(
  mode: "mt" | "td",
  entries: { task: TaskWithBoard; workspaceId: string }[],
  offset: number,
): { text: string; keyboard: InlineButton[][] } {
  const page = entries.slice(offset, offset + PAGE_SIZE);
  const lines = page.map(({ task, workspaceId }) => formatTaskLine(task, workspaceId));
  const title = mode === "td" ? "<b>Горит сегодня / просрочено</b>" : "<b>Мои активные задачи</b>";
  const rangeLabel =
    entries.length > PAGE_SIZE ? `\n\nПоказано ${offset + 1}–${offset + page.length} из ${entries.length}` : "";

  // Слева — быстрое «готово» (как было), справа «⚙️» открывает карточку
  // задачи с архивом и удалением.
  const doneRows: InlineButton[][] = page.map(({ task }) => [
    { text: `✅ ${truncate(task.title, 32)}`, callback_data: `done:${task.id}` },
    taskCardButton(mode, offset, task.id),
  ]);
  const navRow: InlineButton[] = [];
  if (offset > 0) {
    navRow.push({ text: "← Назад", callback_data: `${mode}:${Math.max(0, offset - PAGE_SIZE)}` });
  }
  if (offset + PAGE_SIZE < entries.length) {
    navRow.push({ text: "Ещё →", callback_data: `${mode}:${offset + PAGE_SIZE}` });
  }
  const keyboard = navRow.length > 0 ? [...doneRows, navRow] : doneRows;

  return { text: `${title}\n\n${lines.join("\n\n")}${rangeLabel}`, keyboard };
}

async function handleMyTasks(chatId: string, email: string, onlyDueOrOverdue: boolean): Promise<void> {
  const entries = await collectMyTasks(email);
  const now = new Date();
  const filtered = onlyDueOrOverdue
    ? entries.filter((e) => isOverdue(e.task, now) || isDueToday(e.task, now))
    : entries;
  if (filtered.length === 0) {
    await sendMessage(
      chatId,
      onlyDueOrOverdue ? "На сегодня ничего срочного нет 🎉" : "Активных задач на вас нет 🎉",
    );
    return;
  }
  const { text, keyboard } = buildTasksPage(onlyDueOrOverdue ? "td" : "mt", filtered, 0);
  await sendMessage(chatId, text, { keyboard });
}

async function handleTasksPage(
  chatId: string,
  messageId: number,
  email: string,
  mode: "mt" | "td",
  offset: number,
): Promise<void> {
  const entries = await collectMyTasks(email);
  const now = new Date();
  const filtered = mode === "td" ? entries.filter((e) => isOverdue(e.task, now) || isDueToday(e.task, now)) : entries;
  const { text, keyboard } = buildTasksPage(mode, filtered, offset);
  await editMessageText(chatId, messageId, text, { keyboard });
}

async function handleQuestions(chatId: string, email: string): Promise<void> {
  const workspaces = await listWorkspacesForUser(email);
  const openQuestions: { title: string; workspaceId: string }[] = [];
  for (const ws of workspaces) {
    const questions = await listQuestionsForUser(ws.id, email);
    for (const q of questions) {
      if (q.status === "open") openQuestions.push({ title: q.title, workspaceId: ws.id });
    }
  }
  if (openQuestions.length === 0) {
    await sendMessage(chatId, "Открытых вопросов нет 🎉");
    return;
  }
  const lines = openQuestions
    .slice(0, 15)
    .map((q) => `• ${escapeHtml(q.title)}\n  <a href="${questionsDeepLink(q.workspaceId)}">Открыть</a>`);
  await sendMessage(chatId, `<b>Открытые вопросы</b>\n\n${lines.join("\n\n")}`);
}

async function handleStart(chatId: string, text: string, username: string | null): Promise<void> {
  const token = text.split(" ")[1]?.trim();
  if (!token) {
    await sendMessage(
      chatId,
      "Привет! Чтобы подключить аккаунт, откройте приложение «Пульс» → меню профиля → «Telegram-бот» и получите персональную ссылку.",
    );
    return;
  }
  const email = await consumeTelegramLinkToken(token);
  if (!email) {
    await sendMessage(chatId, "Ссылка недействительна или уже устарела (действует 15 минут). Получите новую в приложении.");
    return;
  }
  await setTelegramLink(email, chatId, username);
  const user = await getUserByEmail(email);
  await sendMessage(
    chatId,
    `Готово! Аккаунт ${escapeHtml(user?.name ?? email)} подключён.\n\n${HELP_TEXT}`,
    { replyKeyboard: MAIN_MENU },
  );
}

async function handleUnlink(chatId: string, email: string): Promise<void> {
  await deleteTelegramLink(email);
  await sendMessage(
    chatId,
    "Аккаунт отвязан. Уведомления и команды бота больше не будут работать, пока не привяжете заново через приложение.",
    { replyKeyboard: [[{ text: "/start" }]] },
  );
}

async function handleCallbackQuery(callbackQuery: {
  id: string;
  data?: string;
  message?: {
    chat: { id: number };
    message_id: number;
    text?: string;
    reply_markup?: { inline_keyboard?: InlineButton[][] };
  };
}): Promise<void> {
  const chatId = String(callbackQuery.message?.chat.id ?? "");
  const link = chatId ? await getTelegramLinkByChatId(chatId) : undefined;
  if (!link) {
    await answerCallbackQuery(callbackQuery.id, "Аккаунт не привязан");
    return;
  }
  const data = callbackQuery.data ?? "";
  const message = callbackQuery.message;

  // Карточка действий по задаче (архив, удаление) — открывается «⚙️» из списков.
  const handledByCard = await handleTaskCardCallback({
    callbackQueryId: callbackQuery.id,
    chatId,
    messageId: message?.message_id,
    email: link.email,
    data,
  });
  if (handledByCard) return;

  // Шаги пошагового создания задачи (/newtask) — включая инлайн-календарь.
  const handledByNewTask = await handleNewTaskCallback({
    callbackQueryId: callbackQuery.id,
    chatId,
    messageId: message?.message_id,
    data,
  });
  if (handledByNewTask) return;

  if (data.startsWith("ag:")) {
    const offset = Number(data.slice("ag:".length)) || 0;
    if (message?.message_id) {
      await handleAssignedPage(chatId, message.message_id, link.email, offset);
    }
    await answerCallbackQuery(callbackQuery.id);
    return;
  }

  if (data.startsWith("mt:") || data.startsWith("td:")) {
    const [mode, offsetStr] = data.split(":") as ["mt" | "td", string];
    if (message?.message_id) {
      await handleTasksPage(chatId, message.message_id, link.email, mode, Number(offsetStr) || 0);
    }
    await answerCallbackQuery(callbackQuery.id);
    return;
  }

  // «Проверено» из напоминания: задача с этапа «На проверке» уходит в «Готово».
  // Жмёт постановщик — он же и получает эти напоминания.
  if (data.startsWith("review_ok:")) {
    const taskId = data.slice("review_ok:".length);
    const task = await getTask(taskId);
    if (!task) {
      await answerCallbackQuery(callbackQuery.id, "Задача не найдена");
      return;
    }
    const user = await getUserByEmail(link.email);
    const mayReview =
      !task.createdBy || task.createdBy === link.email || user?.role === "admin";
    if (!mayReview) {
      await answerCallbackQuery(callbackQuery.id, "Отметить проверку может только постановщик");
      return;
    }
    await updateTask(taskId, {
      stage: "done",
      completedAt: new Date().toISOString(),
      reviewRemindedAt: null,
    });
    await answerCallbackQuery(callbackQuery.id, "Задача закрыта ✅");
    if (message?.message_id) {
      await editMessageText(
        chatId,
        message.message_id,
        `✅ <b>${escapeHtml(task.title)}</b>\n\nПроверено и переведено в «Готово».`,
      );
    }
    return;
  }

  if (data.startsWith("done:")) {
    const taskId = data.slice("done:".length);
    const task = await getTask(taskId);
    if (!task) {
      await answerCallbackQuery(callbackQuery.id, "Задача не найдена");
      return;
    }
    if (!task.assigneeEmails.includes(link.email)) {
      await answerCallbackQuery(callbackQuery.id, "Отмечать можно только свои задачи");
      return;
    }
    await updateTask(taskId, { stage: "done" });
    await answerCallbackQuery(callbackQuery.id, "Отмечено как выполнено ✅");

    const keyboard = message?.reply_markup?.inline_keyboard;
    if (message?.message_id && keyboard && keyboard.length > 1) {
      // Список /mytasks или /today — кнопка одна из многих, убираем только её,
      // текст со списком задач не трогаем.
      const nextKeyboard = keyboard
        .map((row) => row.filter((btn) => btn.callback_data !== data))
        .filter((row) => row.length > 0);
      await editMessageReplyMarkup(chatId, message.message_id, nextKeyboard);
    } else if (message?.message_id && message.text) {
      // Уведомление про одну задачу — как раньше, дописываем в текст и убираем кнопку.
      await editMessageText(chatId, message.message_id, `${message.text}\n\n✅ Выполнено`);
    }
    return;
  }

  if (data.startsWith("start:")) {
    const taskId = data.slice("start:".length);
    const task = await getTask(taskId);
    if (!task || !task.assigneeEmails.includes(link.email)) {
      await answerCallbackQuery(callbackQuery.id, "Задача не найдена или не ваша");
      return;
    }
    await updateTask(taskId, { stage: "in_progress" });
    await answerCallbackQuery(callbackQuery.id, "Взято в работу ▶️");
    return;
  }

  if (data.startsWith("snooze:")) {
    const taskId = data.slice("snooze:".length);
    const task = await getTask(taskId);
    if (!task || !task.assigneeEmails.includes(link.email)) {
      await answerCallbackQuery(callbackQuery.id, "Задача не найдена или не ваша");
      return;
    }
    const base = task.dueDate ? new Date(task.dueDate) : new Date();
    base.setDate(base.getDate() + 1);
    await updateTask(taskId, { dueDate: base.toISOString() });
    await answerCallbackQuery(callbackQuery.id, `Срок перенесён на ${base.toLocaleDateString("ru-RU")} 📅`);
    return;
  }
}

async function handleReplyToQuestion(
  chatId: string,
  email: string,
  replyToText: string,
  bodyText: string,
): Promise<boolean> {
  const match = /Q:([A-Za-z0-9_]+)/.exec(replyToText);
  if (!match) return false;
  const questionId = match[1];
  const question = await getQuestion(questionId);
  const isParticipant =
    question && (question.authorEmail === email || question.recipientEmails.includes(email));
  if (!question || !isParticipant) return false;

  await createMessage({ questionId, authorEmail: email, body: bodyText });
  await sendMessage(chatId, "Ответ отправлен ✅");

  const user = await getUserByEmail(email);
  const others = [question.authorEmail, ...question.recipientEmails].filter(
    (e): e is string => Boolean(e) && e !== email,
  );
  for (const other of others) {
    await notify({
      userEmail: other,
      type: "question_answered",
      title: `Ответ от ${user?.name ?? email}`,
      body: bodyText,
      link: `/w/${question.workspaceId}/questions`,
      telegramText: `💬 <b>${escapeHtml(user?.name ?? email)}</b> ответил(а) на вопрос «${escapeHtml(question.title)}»:\n${escapeHtml(bodyText)}\n\n<code>Q:${question.id}</code>`,
      telegramKeyboard: [[{ text: "Открыть", url: questionsDeepLink(question.workspaceId) }]],
      prefKey: "notifyQuestions",
    });
  }
  return true;
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const received = request.headers.get("x-telegram-bot-api-secret-token");
    if (received !== expectedSecret) {
      return NextResponse.json({ error: "invalid secret" }, { status: 401 });
    }
  }

  const update = await request.json().catch(() => null);
  if (!update) return NextResponse.json({ ok: true });

  try {
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return NextResponse.json({ ok: true });
    }

    const message = update.message;
    if (!message) return NextResponse.json({ ok: true });

    const chatId = String(message.chat.id);
    const rawText: string = message.text ?? "";
    const text = rawText.trim();
    const username: string | null = message.from?.username ?? null;

    if (text.toLowerCase().startsWith("/start")) {
      await handleStart(chatId, text, username);
      return NextResponse.json({ ok: true });
    }

    const link = await getTelegramLinkByChatId(chatId);
    if (!link) {
      await sendMessage(
        chatId,
        "Аккаунт не привязан. Откройте «Пульс» → меню профиля → «Telegram-бот», чтобы получить ссылку для привязки.",
      );
      return NextResponse.json({ ok: true });
    }

    if (message.reply_to_message?.text && text && !text.startsWith("/")) {
      const handled = await handleReplyToQuestion(chatId, link.email, message.reply_to_message.text, text);
      if (handled) return NextResponse.json({ ok: true });
    }

    // Обычный текст (не команда и не кнопка меню) может быть шагом диалога
    // /newtask — например, заголовком задачи. Если черновика нет, обработчик
    // вернёт false и сообщение разберётся дальше как команда.
    if (text && !text.startsWith("/") && !MENU_TEXTS.has(text.toLowerCase())) {
      // Сначала правка существующей задачи из карточки, затем шаги /newtask —
      // состояния не пересекаются, обработчики возвращают false «не моё».
      const handledAsEdit = await handleTaskEditText(chatId, link.email, text);
      if (handledAsEdit) return NextResponse.json({ ok: true });

      const handledAsDraft = await handleNewTaskText(chatId, text);
      if (handledAsDraft) return NextResponse.json({ ok: true });
    }

    // Команды не чувствительны к регистру, плюс кнопки постоянного меню
    // (MAIN_MENU) присылают свой текст как обычное сообщение — распознаём
    // и то, и другое одним switch.
    switch (text.toLowerCase()) {
      case "/newtask":
      case "➕ новая задача":
        await startNewTaskDialog(chatId, link.email);
        break;
      case "/mytasks":
      case "📋 мои задачи":
        await handleMyTasks(chatId, link.email, false);
        break;
      case "/assigned":
      case "📤 я поручил":
        await handleAssignedByMe(chatId, link.email);
        break;
      case "/today":
      case "🔥 сегодня":
        await handleMyTasks(chatId, link.email, true);
        break;
      case "/questions":
      case "❓ вопросы":
        await handleQuestions(chatId, link.email);
        break;
      case "/unlink":
        await handleUnlink(chatId, link.email);
        break;
      case "/help":
      case "❔ помощь":
        await sendMessage(chatId, HELP_TEXT, { replyKeyboard: MAIN_MENU });
        break;
      default:
        await sendMessage(chatId, `Не понял команду.\n\n${HELP_TEXT}`, { replyKeyboard: MAIN_MENU });
    }
  } catch (err) {
    console.error("[telegram webhook] error:", err);
  }

  return NextResponse.json({ ok: true });
}
