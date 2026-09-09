import { NextRequest, NextResponse, after } from "next/server";
import { normalizeAssignees, updateTaskSchema } from "@/lib/validation";
import {
  createTaskEvent,
  deleteTask,
  getBoard,
  getTask,
  updateTask,
} from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { boardDeepLink, escapeHtml } from "@/lib/telegram";
import { notify } from "@/lib/notifications";
import { STAGES, PRIORITIES } from "@/lib/schema";
import type { TaskEventType } from "@/lib/models";

function stageLabel(stage: string): string {
  return STAGES.find((s) => s.id === stage)?.label ?? stage;
}

function priorityLabel(priority: string): string {
  return PRIORITIES.find((p) => p.id === priority)?.label ?? priority;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Комментарий исполнителя и «Найдено, шт.» — поля, которые редактирует
  // либо исполнитель, либо постановщик задачи; проверяем это отдельно
  // (лишний запрос делаем только когда поле реально меняется, чтобы не
  // тормозить обычное перетаскивание карточек по этапам). Заодно эта же
  // «existing»-запись используется ниже, чтобы понять, сменился ли
  // исполнитель/этап/приоритет/срок — для уведомлений и автолога истории.
  const existing = await getTask(id);
  if ("resultNote" in parsed.data || "foundCount" in parsed.data) {
    if (!existing) {
      return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
    }
    const isAssignee = existing.assigneeEmails.includes(user.email);
    const isCreatorOrUnknown =
      !existing.createdBy || existing.createdBy === user.email;

    if ("resultNote" in parsed.data && !isAssignee) {
      return NextResponse.json(
        { error: "Комментарий может редактировать только исполнитель задачи" },
        { status: 403 },
      );
    }
    if ("foundCount" in parsed.data && !isAssignee && !isCreatorOrUnknown) {
      return NextResponse.json(
        {
          error:
            "Найдено количество может менять только создатель или исполнитель задачи",
        },
        { status: 403 },
      );
    }
  }

  const previousAssignees = existing?.assigneeEmails ?? [];
  // Клиент может прислать список (assigneeEmails) или одиночного исполнителя
  // (assigneeEmail) — приводим к одному виду; undefined значит «не менять».
  const nextAssignees = normalizeAssignees(parsed.data);

  // Снимок значений «до». In-memory store (lib/store-memory.ts) отдаёт живой
  // объект задачи и мутирует его внутри updateTask — без копии `existing` и
  // `task` оказались бы одной ссылкой, и ни смена этапа, ни смена приоритета
  // ниже не определялись бы (уведомления и автолог молча не срабатывали).
  // В Postgres-режиме store возвращает отдельные строки, там разницы нет.
  const before = existing ? { ...existing } : undefined;

  // completedAt — источник истины для недельного архивирования «Готово»
  // (см. lib/week.ts). Выставляется только здесь, на сервере, при реальной
  // смене этапа — клиент не может передать его напрямую (нет в схеме).
  let completedAtPatch: string | null | undefined;
  if (
    existing &&
    "stage" in parsed.data &&
    parsed.data.stage !== existing.stage
  ) {
    completedAtPatch =
      parsed.data.stage === "done" ? new Date().toISOString() : null;
  }
  // `archived` в теле — это удобный флаг для клиента; саму метку времени
  // проставляет сервер, как и completedAt. В store уходит уже archivedAt.
  const { archived, ...fields } = parsed.data;
  const archivedAtPatch =
    archived === undefined
      ? undefined
      : archived
        ? new Date().toISOString()
        : null;

  // Обе формы поля исполнителя уже сведены в nextAssignees — в UPDATE они
  // не должны попасть как есть.
  const rest = { ...fields };
  delete rest.assigneeEmail;
  delete rest.assigneeEmails;

  const task = await updateTask(id, {
    ...rest,
    ...(nextAssignees !== undefined ? { assigneeEmails: nextAssignees } : {}),
    ...(completedAtPatch !== undefined
      ? { completedAt: completedAtPatch }
      : {}),
    ...(archivedAtPatch !== undefined ? { archivedAt: archivedAtPatch } : {}),
  });
  if (!task) {
    return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  }

  // Автолог изменений — те же события потом показываются в ленте задачи
  // (комментарии + история вперемешку, см. /api/tasks/[id]/events).
  if (before) {
    const diffs: {
      type: TaskEventType;
      from: string | null;
      to: string | null;
    }[] = [];
    if ("stage" in parsed.data && task.stage !== before.stage) {
      diffs.push({ type: "stage_changed", from: before.stage, to: task.stage });
    }
    if ("priority" in parsed.data && task.priority !== before.priority) {
      diffs.push({
        type: "priority_changed",
        from: before.priority,
        to: task.priority,
      });
    }
    if (
      nextAssignees !== undefined &&
      task.assigneeEmails.join(",") !== before.assigneeEmails.join(",")
    ) {
      diffs.push({
        type: "assignee_changed",
        from: before.assigneeEmails.join(", ") || null,
        to: task.assigneeEmails.join(", ") || null,
      });
    }
    if ("dueDate" in parsed.data && task.dueDate !== before.dueDate) {
      diffs.push({
        type: "due_date_changed",
        from: before.dueDate,
        to: task.dueDate,
      });
    }
    for (const diff of diffs) {
      after(() =>
        createTaskEvent({
          taskId: task.id,
          type: diff.type,
          authorEmail: user.email,
          fromValue: diff.from,
          toValue: diff.to,
        }),
      );
    }
  }

  // Уведомляем только тех, кого добавили этим запросом: при правке других
  // полей или снятии одного из исполнителей остальных дёргать не за что.
  const addedAssignees =
    nextAssignees === undefined
      ? []
      : task.assigneeEmails.filter(
          (e) => !previousAssignees.includes(e) && e !== user.email,
        );
  if (addedAssignees.length > 0) {
    const board = await getBoard(task.boardId);
    if (board) {
      // after() — иначе fire-and-forget fetch к Telegram обрывается заморозкой
      // serverless-функции сразу после ответа (Vercel), уведомление теряется
      // или приходит только со следующим «тёплым» вызовом функции.
      for (const assignee of addedAssignees) {
        after(() =>
          notify({
            userEmail: assignee,
            type: "task_assigned",
            title: `${user.name} назначил(а) вам задачу`,
            body: task.title,
            link: `/w/${board.workspaceId}/boards/${board.id}`,
            telegramText: `📋 <b>${escapeHtml(user.name)}</b> назначил(а) вам задачу:\n<b>${escapeHtml(task.title)}</b>${
              task.dueDate
                ? `\nСрок: ${new Date(task.dueDate).toLocaleDateString("ru-RU")}`
                : ""
            }`,
            telegramKeyboard: [
              [
                {
                  text: "Открыть",
                  url: boardDeepLink(board.workspaceId, board.id),
                },
              ],
              [
                { text: "▶️ В работу", callback_data: `start:${task.id}` },
                { text: "📅 +1 день", callback_data: `snooze:${task.id}` },
                { text: "✅ Готово", callback_data: `done:${task.id}` },
              ],
            ],
            prefKey: "notifyTaskAssigned",
          }),
        );
      }
    }
  }

  // Смена этапа — сообщаем постановщику задачи (если менял не он сам): так
  // он узнаёт, что задача пришла «на проверку» или готова, не открывая доску.
  if (
    before &&
    "stage" in parsed.data &&
    task.stage !== before.stage &&
    task.createdBy &&
    task.createdBy !== user.email
  ) {
    const board = await getBoard(task.boardId);
    if (board) {
      after(() =>
        notify({
          userEmail: task.createdBy!,
          type: "task_stage_changed",
          title: `Этап изменён: ${task.title}`,
          body: `${stageLabel(before.stage)} → ${stageLabel(task.stage)} (${user.name})`,
          link: `/w/${board.workspaceId}/boards/${board.id}`,
          telegramText: `🔄 <b>${escapeHtml(user.name)}</b> изменил(а) этап задачи «${escapeHtml(task.title)}»:\n${escapeHtml(stageLabel(before.stage))} → <b>${escapeHtml(stageLabel(task.stage))}</b>`,
          telegramKeyboard: [
            [
              {
                text: "Открыть",
                url: boardDeepLink(board.workspaceId, board.id),
              },
            ],
          ],
          prefKey: "notifyStageChanges",
        }),
      );
    }
  }

  // Та же смена этапа — исполнителю, если этап поменял не он сам. Постановщик
  // уже получил уведомление выше; когда он же и исполнитель, второе сообщение
  // об одном событии не отправляем.
  const stageChanged = Boolean(
    before && "stage" in parsed.data && task.stage !== before.stage,
  );
  const stageRecipients = stageChanged
    ? task.assigneeEmails.filter(
        (e) => e !== user.email && e !== task.createdBy,
      )
    : [];
  if (before && stageRecipients.length > 0) {
    const board = await getBoard(task.boardId);
    if (board) {
      for (const assignee of stageRecipients) {
        after(() =>
          notify({
            userEmail: assignee,
            type: "task_stage_changed",
            title: `Этап изменён: ${task.title}`,
            body: `${stageLabel(before.stage)} → ${stageLabel(task.stage)} (${user.name})`,
            link: `/w/${board.workspaceId}/boards/${board.id}`,
            telegramText: `🔄 <b>${escapeHtml(user.name)}</b> изменил(а) этап вашей задачи «${escapeHtml(task.title)}»:\n${escapeHtml(stageLabel(before.stage))} → <b>${escapeHtml(stageLabel(task.stage))}</b>`,
            telegramKeyboard: [
              [
                {
                  text: "Открыть",
                  url: boardDeepLink(board.workspaceId, board.id),
                },
              ],
            ],
            prefKey: "notifyStageChanges",
          }),
        );
      }
    }
  }

  return NextResponse.json({ task });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;

  const existing = await getTask(id);
  const board = existing ? await getBoard(existing.boardId) : undefined;
  await deleteTask(id);

  if (existing && board) {
    const recipients = new Set(
      [...existing.assigneeEmails, existing.createdBy].filter(
        (e): e is string => Boolean(e) && e !== user.email,
      ),
    );
    for (const recipient of recipients) {
      after(() =>
        notify({
          userEmail: recipient,
          type: "task_deleted",
          title: `${user.name} удалил(а) задачу`,
          body: existing.title,
          link: `/w/${board.workspaceId}/boards/${board.id}`,
          telegramText: `🗑️ <b>${escapeHtml(user.name)}</b> удалил(а) задачу:\n<b>${escapeHtml(existing.title)}</b>`,
          prefKey: "notifyTaskDeleted",
        }),
      );
    }
  }

  return NextResponse.json({ ok: true });
}
