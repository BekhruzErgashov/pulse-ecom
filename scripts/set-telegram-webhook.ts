import { config } from "dotenv";
import { existsSync } from "fs";
import { resolve } from "path";
import { BOT_COMMANDS } from "../lib/telegram-commands";

// dotenv по умолчанию грузит только .env — а Next.js использует .env.local.
// Подхватываем оба, приоритет у .env.local (как и в самом Next.js).
for (const file of [".env", ".env.local"]) {
  const path = resolve(process.cwd(), file);
  if (existsSync(path)) config({ path, override: true });
}

/**
 * Одноразовая регистрация вебхука бота в Telegram — запускать один раз
 * после деплоя (или при смене APP_URL/секрета):
 *   npm run telegram:webhook
 *
 * Telegram будет слать все обновления (сообщения, нажатия кнопок) на
 * APP_URL/api/telegram/webhook, подписывая их секретом TELEGRAM_WEBHOOK_SECRET
 * в заголовке X-Telegram-Bot-Api-Secret-Token — так наш роут отличает
 * настоящие запросы Telegram от посторонних.
 */
async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.error("[telegram:webhook] TELEGRAM_BOT_TOKEN не задан в .env.local");
    process.exit(1);
  }
  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    console.error("[telegram:webhook] APP_URL не задан в .env.local (нужен публичный HTTPS-адрес)");
    process.exit(1);
  }
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[telegram:webhook] TELEGRAM_WEBHOOK_SECRET не задан в .env.local");
    process.exit(1);
  }

  const webhookUrl = `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`;
  console.log(`[telegram:webhook] Регистрируем вебхук: ${webhookUrl}`);

  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
    }),
  });
  const data = await res.json();
  if (!data.ok) {
    console.error("[telegram:webhook] Telegram ответил ошибкой:", data.description);
    process.exit(1);
  }
  console.log("[telegram:webhook] Готово:", data.description ?? "webhook set");

  const infoRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`);
  const info = await infoRes.json();
  console.log("[telegram:webhook] Текущее состояние:", JSON.stringify(info.result, null, 2));

  // Список команд для подсказки при вводе «/» в Telegram-клиенте.
  const commandsRes = await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands: BOT_COMMANDS }),
  });
  const commandsData = await commandsRes.json();
  if (!commandsData.ok) {
    console.error("[telegram:webhook] Не удалось задать команды:", commandsData.description);
  } else {
    console.log("[telegram:webhook] Команды бота обновлены");
  }
}

main().catch((err) => {
  console.error("[telegram:webhook] Ошибка:", err);
  process.exit(1);
});
