import { NextRequest, NextResponse } from "next/server";
import { updateChecklistItemSchema } from "@/lib/validation";
import {
  deleteChecklistItem,
  getBoard,
  getChecklistItem,
  getTask,
  updateChecklistItem,
} from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { canAccessWorkspace } from "@/lib/access";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id, itemId } = await params;
  const task = await getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  }
  const board = await getBoard(task.boardId);
  if (!board || !(await canAccessWorkspace(user, board.workspaceId))) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  const item = await getChecklistItem(itemId);
  if (!item || item.taskId !== id) {
    return NextResponse.json({ error: "Пункт не найден" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = updateChecklistItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const updated = await updateChecklistItem(itemId, parsed.data);
  return NextResponse.json({ item: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id, itemId } = await params;
  const task = await getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  }
  const board = await getBoard(task.boardId);
  if (!board || !(await canAccessWorkspace(user, board.workspaceId))) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  const item = await getChecklistItem(itemId);
  if (!item || item.taskId !== id) {
    return NextResponse.json({ error: "Пункт не найден" }, { status: 404 });
  }
  await deleteChecklistItem(itemId);
  return NextResponse.json({ ok: true });
}
