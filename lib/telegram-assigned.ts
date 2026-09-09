import "server-only";
import { getUserByEmail, listTasksCreatedByInWorkspace, listWorkspacesForUser } from "@/lib/data";
import {
  boardDeepLink,
  editMessageText,
  escapeHtml,
  sendMessage,
  type InlineButton,
} from "@/lib/telegram";
import { compareTasks, isDueToday, isOverdue } from "@/lib/task-sort";
import { STAGES } from "@/lib/schema";
import { taskCardButton } from "@/lib/telegram-task-actions";
import type { TaskWithBoard } from "@/lib/models";

/**
 * Команда /assigned («📤 Я поручил») — обратная сторона /mytasks: задачи,
 * которые пользователь поставил другим. Для каждой видно, кому поручена, на
 * каком этапе, когда поставлена и какой срок.
 */

const PAGE_SIZE = 8;

function stageLabel(stage: string): string {
  return STAGES.find((s) => s.id === stage)?.label ?? stage;
}

/**
 * Задачи, которые пользователь поставил другим. Свои же задачи (поставил сам
 * себе) сюда не попадают — они и так в /mytasks; выполненные тоже, их число
 * показываем отдельной строкой в конце.
 */
async function collectAssignedByMe(
  email: string,
): Promise<{ entries: { task: TaskWithBoard; workspaceId: string }[]; doneCount: number }> {
  const workspaces = await listWorkspacesForUser(email);
  const entries: { task: TaskWithBoard; workspaceId: string }[] = [];
  let doneCount = 0;
  for (const ws of workspaces) {
    const tasks = await listTasksCreatedByInWorkspace(ws.id, email);
    for (const task of tasks) {
      if (task.assigneeEmail === email) continue;
      if (task.stage === "done") {
        doneCount += 1;
        continue;
      }
      entries.push({ task, workspaceId: ws.id });
    }
  }
  entries.sort((a, b) => compareTasks(a.task, b.task));
  return { entries, doneCount };
}

/** Одна строка списка «я поручил»: кому, на какой доске, на каком этапе, когда поставлена и какой срок. */
async function formatAssignedLine(task: TaskWithBoard, workspaceId: string): Promise<string> {
  const assignee = task.assigneeEmail ? await getUserByEmail(task.assigneeEmail) : undefined;
  const assigneeLabel = task.assigneeEmail
    ? (assignee?.name ?? task.assigneeEmail)
    : "исполнитель не назначен";

  const now = new Date();
  const due = task.dueDate ? new Date(task.dueDate).toLocaleDateString("ru-RU") : null;
  let dueLabel = "без срока";
  if (due) {
    dueLabel = isOverdue(task, now)
      ? `⚠️ просрочено (${due})`
      : isDueToday(task, now)
        ? "сегодня"
        : `до ${due}`;
  }
  const createdLabel = new Date(task.createdAt).toLocaleDateString("ru-RU");

  return [
    `• <b>${escapeHtml(task.title)}</b>`,
    `  👤 ${escapeHtml(assigneeLabel)} — ${escapeHtml(stageLabel(task.stage))}`,
    `  🗓 поставлена ${createdLabel}, срок: ${dueLabel}`,
    `  ${escapeHtml(task.boardName)} · <a href="${boardDeepLink(workspaceId, task.boardId)}">Открыть</a>`,
  ].join("\n");
}

/** Страница списка «я поручил» — и для первой отправки, и для «Ещё →» через editMessageText. */
async function buildAssignedPage(
  entries: { task: TaskWithBoard; workspaceId: string }[],
  doneCount: number,
  offset: number,
): Promise<{ text: string; keyboard: InlineButton[][] }> {
  const page = entries.slice(offset, offset + PAGE_SIZE);
  const lines = await Promise.all(page.map(({ task, workspaceId }) => formatAssignedLine(task, workspaceId)));

  const footer: string[] = [];
  if (entries.length > PAGE_SIZE) {
    footer.push(`Показано ${offset + 1}–${offset + page.length} из ${entries.length}`);
  }
  if (doneCount > 0) {
    footer.push(`Выполнено: ${doneCount}`);
  }

  // По кнопке на задачу — карточка с архивом и удалением.
  const taskRows: InlineButton[][] = page.map(({ task }) => [
    taskCardButton("ag", offset, task.id, `⚙️ ${task.title.length > 32 ? `${task.title.slice(0, 31)}…` : task.title}`),
  ]);

  const navRow: InlineButton[] = [];
  if (offset > 0) {
    navRow.push({ text: "← Назад", callback_data: `ag:${Math.max(0, offset - PAGE_SIZE)}` });
  }
  if (offset + PAGE_SIZE < entries.length) {
    navRow.push({ text: "Ещё →", callback_data: `ag:${offset + PAGE_SIZE}` });
  }

  const text = `<b>Задачи, которые я поручил</b>\n\n${lines.join("\n\n")}${
    footer.length > 0 ? `\n\n${footer.join(" · ")}` : ""
  }`;
  return { text, keyboard: navRow.length > 0 ? [...taskRows, navRow] : taskRows };
}

export async function handleAssignedByMe(chatId: string, email: string): Promise<void> {
  const { entries, doneCount } = await collectAssignedByMe(email);
  if (entries.length === 0) {
    await sendMessage(
      chatId,
      doneCount > 0
        ? `Незакрытых задач, которые вы поручили, нет — все ${doneCount} выполнены 🎉`
        : "Вы пока никому не поручали задач. Создать — /newtask",
    );
    return;
  }
  const { text, keyboard } = await buildAssignedPage(entries, doneCount, 0);
  await sendMessage(chatId, text, { keyboard });
}

export async function handleAssignedPage(
  chatId: string,
  messageId: number,
  email: string,
  offset: number,
): Promise<void> {
  const { entries, doneCount } = await collectAssignedByMe(email);
  const { text, keyboard } = await buildAssignedPage(entries, doneCount, offset);
  await editMessageText(chatId, messageId, text, { keyboard });
}
