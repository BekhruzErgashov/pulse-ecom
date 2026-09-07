import "server-only";
import {
  listMyTasksInWorkspace,
  listQuestionsForUser,
  listWorkspacesForUser,
} from "@/lib/data";
import { isDueToday, isOverdue } from "@/lib/task-sort";
import { boardDeepLink, escapeHtml } from "@/lib/telegram";

/**
 * Собирает текст ежедневной сводки для одного пользователя: просроченные и
 * сегодняшние задачи + количество открытых вопросов. Возвращает null, если
 * рассказывать не о чем (чтобы не слать пустые сообщения каждый день).
 * Используется и в cron-дайджесте, и потенциально в будущих командах бота.
 */
export async function buildDailyDigest(email: string): Promise<string | null> {
  const workspaces = await listWorkspacesForUser(email);
  const urgentLines: string[] = [];
  let openQuestions = 0;

  for (const ws of workspaces) {
    const tasks = await listMyTasksInWorkspace(ws.id, email);
    const now = new Date();
    for (const task of tasks) {
      if (task.stage === "done") continue;
      if (isOverdue(task, now)) {
        urgentLines.push(
          `⚠️ <b>${escapeHtml(task.title)}</b> — ${escapeHtml(task.boardName)}, просрочено\n  <a href="${boardDeepLink(ws.id, task.boardId)}">Открыть</a>`,
        );
      } else if (isDueToday(task, now)) {
        urgentLines.push(
          `🔥 <b>${escapeHtml(task.title)}</b> — ${escapeHtml(task.boardName)}, срок сегодня\n  <a href="${boardDeepLink(ws.id, task.boardId)}">Открыть</a>`,
        );
      }
    }
    const questions = await listQuestionsForUser(ws.id, email);
    openQuestions += questions.filter((q) => q.status === "open").length;
  }

  if (urgentLines.length === 0 && openQuestions === 0) return null;

  const parts = ["<b>Сводка на сегодня</b>"];
  if (urgentLines.length > 0) parts.push(urgentLines.slice(0, 10).join("\n\n"));
  if (openQuestions > 0) {
    parts.push(`💬 Открытых вопросов: ${openQuestions} — команда /questions в боте.`);
  }
  return parts.join("\n\n");
}
