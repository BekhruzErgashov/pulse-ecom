import { NextRequest, NextResponse } from "next/server";
import { getBoard, listArchivedTasksByBoard, listUsers } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { canAccessWorkspace } from "@/lib/access";

/**
 * Архив доски — задачи, убранные из канбана без удаления (см. archivedAt в
 * lib/models.ts). Отдельный роут, а не флаг в GET /api/boards/[id]: обычная
 * доска грузится на каждом поллинге, тащить туда ещё и архив незачем.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const board = await getBoard(id);
  if (!board) {
    return NextResponse.json({ error: "Доска не найдена" }, { status: 404 });
  }
  if (!(await canAccessWorkspace(user, board.workspaceId))) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const [tasks, allUsers] = await Promise.all([listArchivedTasksByBoard(id), listUsers()]);
  return NextResponse.json({ tasks, allUsers });
}
