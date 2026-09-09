import "server-only";
import {
  deleteArchivedTasksBefore,
  getTelegramLinkByEmail,
  listTasksAwaitingReview,
  updateTask,
} from "@/lib/data";
import { boardDeepLink, escapeHtml, sendMessage } from "@/lib/telegram";

/**
 * Ежедневное обслуживание задач. Вызывается из cron-роута — отдельным
 * модулем, чтобы роут остался тонким, а логику можно было прогнать тестом.
 */

/** Сколько задача лежит в архиве до автоматического удаления. */
export const ARCHIVE_RETENTION_DAYS = 183;

/** Не напоминаем о проверке чаще, чем раз в сутки, даже если cron запускают чаще. */
const REMIND_INTERVAL_HOURS = 20;

/**
 * Напоминает постановщикам о задачах, зависших на этапе «На проверке».
 * Напоминание уходит раз в сутки и прекращается, когда постановщик нажмёт
 * «Проверено» (задача уходит в «Готово» и перестаёт попадать в выборку).
 */
export async function sendReviewReminders(): Promise<{ checked: number; sent: number }> {
  const remindedBefore = new Date(Date.now() - REMIND_INTERVAL_HOURS * 60 * 60 * 1000).toISOString();
  const pending = await listTasksAwaitingReview(remindedBefore);

  let sent = 0;
  for (const { task, boardName, workspaceId } of pending) {
    const link = task.createdBy ? await getTelegramLinkByEmail(task.createdBy) : undefined;
    // Отметку ставим даже без привязанного Telegram: иначе задача каждый день
    // заново попадала бы в выборку и раздувала работу cron.
    await updateTask(task.id, { reviewRemindedAt: new Date().toISOString() });
    if (!link || !link.notifyStageChanges) continue;

    const due = task.dueDate ? new Date(task.dueDate).toLocaleDateString("ru-RU") : "без срока";
    await sendMessage(
      link.chatId,
      [
        "🔎 <b>Ждёт вашей проверки</b>",
        "",
        `<b>${escapeHtml(task.title)}</b>`,
        `Доска: ${escapeHtml(boardName)} · срок: ${due}`,
        "",
        "Напоминание приходит раз в день, пока задача не закрыта.",
      ].join("\n"),
      {
        keyboard: [
          [{ text: "Открыть", url: boardDeepLink(workspaceId, task.boardId) }],
          [{ text: "✅ Проверено", callback_data: `review_ok:${task.id}` }],
        ],
      },
    );
    sent += 1;
  }

  return { checked: pending.length, sent };
}

/** Удаляет задачи, пролежавшие в архиве дольше ARCHIVE_RETENTION_DAYS. Вложения уходят вместе с задачей (ON DELETE CASCADE). */
export async function purgeOldArchivedTasks(): Promise<number> {
  const before = new Date(Date.now() - ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  return deleteArchivedTasksBefore(before);
}
