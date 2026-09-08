/**
 * Список команд бота — единственный источник правды. Лежит отдельно от
 * lib/telegram.ts намеренно: тот помечен "server-only" и не импортируется в
 * scripts/set-telegram-webhook.ts (обычный tsx-скрипт вне Next). Раньше из-за
 * этого список был продублирован в скрипте, и правка в lib/telegram.ts до
 * Telegram не доезжала.
 */
export const BOT_COMMANDS = [
  { command: "newtask", description: "Создать задачу пошагово" },
  { command: "today", description: "Горит сегодня / просрочено" },
  { command: "mytasks", description: "Мои активные задачи" },
  { command: "assigned", description: "Задачи, которые я поручил" },
  { command: "questions", description: "Открытые вопросы" },
  { command: "unlink", description: "Отвязать аккаунт" },
  { command: "help", description: "Список команд" },
] as const;
