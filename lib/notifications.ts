import "server-only";
import { createNotification, getTelegramLinkByEmail } from "@/lib/data";
import { sendMessage, type InlineKeyboard } from "@/lib/telegram";
import type { NotificationType, TelegramNotifyPrefKey } from "@/lib/models";

export interface NotifyEvent {
  userEmail: string;
  type: NotificationType;
  /** Заголовок и текст для внутриприложенческого уведомления (колокольчик) — создаётся всегда, без учёта Telegram-настроек. */
  title: string;
  body: string;
  /** Относительный путь внутри приложения, куда ведёт клик по уведомлению в колокольчике. */
  link?: string | null;
  /** HTML-текст для Telegram — может отличаться от in-app версии (эмодзи, форматирование, диплинки). */
  telegramText: string;
  telegramKeyboard?: InlineKeyboard;
  /**
   * Какой Telegram-переключатель пользователя проверять перед отправкой в
   * бота (in-app уведомление создаётся в любом случае). Не указывайте для
   * событий без своего переключателя (например, админ-рассылка) — тогда
   * в Telegram уйдёт всем, у кого бот вообще привязан.
   */
  prefKey?: TelegramNotifyPrefKey;
}

/**
 * Единая точка отправки уведомлений — пишет запись в внутриприложенческий
 * «колокольчик» (всегда) и, если у пользователя привязан и настроен
 * Telegram-бот, дублирует туда же. Ни один из каналов не должен ронять
 * основной запрос (создание задачи, ответ на вопрос и т.д.) — поэтому обе
 * попытки обёрнуты в try/catch и ошибки только логируются.
 */
export async function notify(event: NotifyEvent): Promise<void> {
  try {
    await createNotification({
      userEmail: event.userEmail,
      type: event.type,
      title: event.title,
      body: event.body,
      link: event.link ?? null,
    });
  } catch (err) {
    console.warn("[notify] не удалось создать внутриприложенческое уведомление:", err);
  }

  try {
    const link = await getTelegramLinkByEmail(event.userEmail);
    if (!link) return;
    if (event.prefKey && !link[event.prefKey]) return;
    await sendMessage(link.chatId, event.telegramText, { keyboard: event.telegramKeyboard });
  } catch (err) {
    console.warn("[notify] отправка в Telegram не удалась:", err);
  }
}
