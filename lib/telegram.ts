import "server-only";
import { getTelegramLinkByEmail } from "@/lib/data";
import { BOT_COMMANDS } from "@/lib/telegram-commands";

/**
 * Токен бота задаётся ТОЛЬКО переменной окружения TELEGRAM_BOT_TOKEN —
 * получить его можно у @BotFather. Значение живёт в .env.local (локально)
 * и в Environment Variables хостинга; в коде значения по умолчанию нет
 * намеренно — иначе токен утекает в репозиторий.
 * Бот: https://t.me/diytask_tracker_bot
 */
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";

/**
 * Базовый URL приложения — нужен для диплинков «Открыть» в уведомлениях
 * (ведут обратно в конкретную задачу/вопрос). На Vercel можно оставить
 * пустым — тогда используется VERCEL_URL, иначе задайте APP_URL явно.
 */
export function appUrl(): string {
  return (
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

function apiUrl(method: string): string {
  return `https://api.telegram.org/bot${BOT_TOKEN}/${method}`;
}

export interface InlineButton {
  text: string;
  url?: string;
  callback_data?: string;
}

export type InlineKeyboard = InlineButton[][];

/** Постоянная клавиатура внизу чата (не привязана к конкретному сообщению, живёт до следующей смены). */
export type ReplyKeyboard = { text: string }[][];

/** Экранирует спецсимволы Telegram HTML parse_mode (только &, <, > — этого достаточно для наших сообщений). */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 600;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Вызов Telegram Bot API с ретраями: 429 (превышен рейт-лимит — уважаем
 * присланный Telegram `retry_after`) и 5xx/сетевые сбои повторяем с
 * экспоненциальной паузой, чтобы редкие временные сбои не роняли
 * уведомление молча (как было раньше — один неудачный fetch и сообщение
 * просто терялось).
 */
async function callTelegramApi<T = unknown>(
  method: string,
  payload: Record<string, unknown>,
  attempt = 1,
): Promise<{ ok: boolean; result?: T; description?: string }> {
  if (!BOT_TOKEN) {
    console.warn("[telegram] TELEGRAM_BOT_TOKEN не задан — пропускаем вызов", method);
    return { ok: false, description: "no token" };
  }
  try {
    const res = await fetch(apiUrl(method), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!data.ok) {
      const retryAfterSec = data.parameters?.retry_after as number | undefined;
      const shouldRetry = (res.status === 429 || res.status >= 500) && attempt < MAX_ATTEMPTS;
      if (shouldRetry) {
        const delayMs = retryAfterSec ? retryAfterSec * 1000 : BACKOFF_BASE_MS * 2 ** (attempt - 1);
        await sleep(delayMs);
        return callTelegramApi(method, payload, attempt + 1);
      }
      console.warn(`[telegram] ${method} failed:`, data.description);
    }
    return data;
  } catch (err) {
    if (attempt < MAX_ATTEMPTS) {
      await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1));
      return callTelegramApi(method, payload, attempt + 1);
    }
    console.warn(`[telegram] ${method} threw:`, err);
    return { ok: false, description: String(err) };
  }
}

export async function sendMessage(
  chatId: string,
  text: string,
  options?: { keyboard?: InlineKeyboard; replyKeyboard?: ReplyKeyboard },
): Promise<void> {
  const replyMarkup = options?.keyboard
    ? { inline_keyboard: options.keyboard }
    : options?.replyKeyboard
      ? { keyboard: options.replyKeyboard, resize_keyboard: true }
      : undefined;
  await callTelegramApi("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
}

/**
 * Регистрирует список команд бота (подсказка при вводе «/» в Telegram) —
 * достаточно один раз после деплоя, вызывается из scripts/set-telegram-webhook.ts.
 */
export async function setMyCommands(): Promise<void> {
  await callTelegramApi("setMyCommands", { commands: BOT_COMMANDS });
}

export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  await callTelegramApi("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    ...(text ? { text, show_alert: false } : {}),
  });
}

export async function editMessageText(
  chatId: string,
  messageId: number,
  text: string,
  options?: { keyboard?: InlineKeyboard },
): Promise<void> {
  await callTelegramApi("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(options?.keyboard ? { reply_markup: { inline_keyboard: options.keyboard } } : {}),
  });
}

/** Меняет только инлайн-клавиатуру уже отправленного сообщения, текст не трогает — используется, чтобы убрать одну кнопку «✅ Готово» из списка задач, не переписывая весь список. */
export async function editMessageReplyMarkup(
  chatId: string,
  messageId: number,
  keyboard: InlineKeyboard,
): Promise<void> {
  await callTelegramApi("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: keyboard },
  });
}

export async function setWebhook(url: string, secretToken: string): Promise<void> {
  await callTelegramApi("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"],
  });
}

/** Диплинк «Открыть» на конкретную доску/задачу внутри приложения. */
export function boardDeepLink(workspaceId: string, boardId: string): string {
  return `${appUrl()}/w/${workspaceId}/boards/${boardId}`;
}

export function questionsDeepLink(workspaceId: string): string {
  return `${appUrl()}/w/${workspaceId}/questions`;
}

/**
 * Отправляет сообщение пользователю приложения по email, если у него привязан
 * Telegram. Если аккаунт не привязан — тихо ничего не делает (это ожидаемо:
 * не у всех участников подключён бот), ошибки самого Telegram API тоже не
 * пробрасываются наружу — уведомление никогда не должно ронять основной
 * запрос (создание задачи, ответ на вопрос и т.д.).
 */
export async function notifyUser(
  email: string,
  text: string,
  options?: { keyboard?: InlineKeyboard; replyKeyboard?: ReplyKeyboard },
): Promise<void> {
  try {
    const link = await getTelegramLinkByEmail(email);
    if (!link) return;
    await sendMessage(link.chatId, text, options);
  } catch (err) {
    console.warn("[telegram] notifyUser failed:", err);
  }
}

export function isTelegramConfigured(): boolean {
  return Boolean(BOT_TOKEN);
}
