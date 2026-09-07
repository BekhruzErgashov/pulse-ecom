import { NextRequest, NextResponse } from "next/server";
import { createBoardSchema } from "@/lib/validation";
import { createBoard, listBoards, listTasksByBoard } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { canAccessWorkspace } from "@/lib/access";
import type { BoardWithProgress } from "@/lib/models";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "Не указано пространство" }, { status: 400 });
  }
  if (!(await canAccessWorkspace(user, workspaceId))) {
    return NextResponse.json({ error: "Нет доступа к этому пространству" }, { status: 403 });
  }

  const boards = await listBoards(workspaceId);
  const withProgress: BoardWithProgress[] = await Promise.all(
    boards.map(async (board) => {
      const tasks = await listTasksByBoard(board.id);
      return {
        ...board,
        taskCount: tasks.length,
        doneCount: tasks.filter((t) => t.stage === "done").length,
        latestTaskAt:
          tasks.length > 0
            ? tasks.reduce((max, t) => (t.createdAt > max ? t.createdAt : max), tasks[0].createdAt)
            : null,
      };
    }),
  );
  return NextResponse.json({ boards: withProgress });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createBoardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (!(await canAccessWorkspace(user, parsed.data.workspaceId))) {
    return NextResponse.json({ error: "Нет доступа к этому пространству" }, { status: 403 });
  }

  const board = await createBoard({
    workspaceId: parsed.data.workspaceId,
    name: parsed.data.name,
    description: parsed.data.description ?? "",
    ownerEmail: user.email,
  });
  return NextResponse.json({ board }, { status: 201 });
}
