import { NextRequest, NextResponse } from "next/server";
import { createChecklistItemSchema } from "@/lib/validation";
import { createChecklistItem, getBoard, getTask, listChecklistItems } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { canAccessWorkspace } from "@/lib/access";

const MAX_ITEMS = 30;

/**
 * Чек-лист задачи — по тому же принципу доступа, что и комментарии
 * (task-events): читать и добавлять пункты может любой участник
 * пространства, где лежит доска задачи, а не только создатель/исполнитель —
 * чек-лист рассчитан на совместную работу над задачей.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const task = await getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  }
  const board = await getBoard(task.boardId);
  if (!board || !(await canAccessWorkspace(user, board.workspaceId))) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  const items = await listChecklistItems(id);
  return NextResponse.json({ items });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const task = await getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  }
  const board = await getBoard(task.boardId);
  if (!board || !(await canAccessWorkspace(user, board.workspaceId))) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createChecklistItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const existing = await listChecklistItems(id);
  if (existing.length >= MAX_ITEMS) {
    return NextResponse.json(
      { error: `Не больше ${MAX_ITEMS} пунктов в чек-листе` },
      { status: 400 },
    );
  }

  const item = await createChecklistItem({
    taskId: id,
    text: parsed.data.text,
    createdBy: user.email,
  });
  return NextResponse.json({ item }, { status: 201 });
}
