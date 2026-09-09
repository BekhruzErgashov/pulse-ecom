import { NextRequest, NextResponse } from "next/server";
import { listTelegramLinks } from "@/lib/data";
import { sendMessage } from "@/lib/telegram";
import { buildDailyDigest } from "@/lib/telegram-digest";
import { purgeOldArchivedTasks, sendReviewReminders } from "@/lib/task-maintenance";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Ежедневный cron: сводка по Telegram, напоминания о задачах на проверке и
 * удаление задач, пролежавших в архиве полгода (см. lib/task-maintenance.ts).
 *
 * Сводка по Telegram: просроченные/сегодняшние задачи и число
 * открытых вопросов. Каждому пользователю сообщение уходит только когда
 * текущий UTC-час совпадает с его персональным `digestHourUtc` (по
 * умолчанию 4 — настройки см. в диалоге привязки Telegram) и `notifyDigest`
 * включён.
 *
 * ВАЖНО про расписание: Vercel Hobby-план разрешает cron не чаще раза в
 * сутки, поэтому `vercel.json` вызывает этот роут один раз в день (в 4:00
 * UTC — совпадает с дефолтным `digestHourUtc`). Из-за этого персональный
 * час реально применяется только к пользователям, которые ничего не меняли
 * (или выставили 4). Если нужна настоящая почасовая доставка — либо
 * перейти на Vercel Pro и вернуть `"schedule": "0 * * * *"` в
 * `vercel.json`, либо дергать этот GET раз в час извне (например,
 * cron-job.org или GitHub Actions) с заголовком
 * `Authorization: Bearer <CRON_SECRET>` — логика фильтрации по часу уже
 * готова к этому, менять код не придётся. Защищено CRON_SECRET — Vercel
 * Cron присылает его в заголовке Authorization, если он задан как
 * переменная окружения; при локальном запуске проверка пропускается, если
 * секрет не задан вовсе.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const currentHourUtc = new Date().getUTCHours();
  const links = await listTelegramLinks();
  const due = links.filter((link) => link.notifyDigest && link.digestHourUtc === currentHourUtc);

  let sent = 0;
  for (const link of due) {
    const digest = await buildDailyDigest(link.email);
    if (!digest) continue;
    await sendMessage(link.chatId, digest);
    sent += 1;
  }

  // Обслуживание задач не зависит от персонального часа дайджеста: оно
  // должно отработать один раз за запуск cron, кому бы ни ушла сводка.
  const reviews = await sendReviewReminders();
  const purged = await purgeOldArchivedTasks();

  return NextResponse.json({
    ok: true,
    hourUtc: currentHourUtc,
    due: due.length,
    sent,
    reviewReminders: reviews,
    archivedPurged: purged,
  });
}
