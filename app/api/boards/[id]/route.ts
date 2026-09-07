import { NextRequest, NextResponse } from "next/server";
import {
  addBoardMember,
  deleteBoard,
  getBoard,
  listTasksByBoard,
  listUsers,
  listWorkspaceMemberEmails,
  updateBoard,
} from "@/lib/data";
import { addMemberSchema, updateBoardSchema } from "@/lib/validation";
import { getCurrentUser } from "@/lib/session";
import { canAccessWorkspace } from "@/lib/access";
import { collectDoneWeeks, filterDoneTasksByWeek, getCurrentWeekKey } from "@/lib/week";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const [board, allTasks, allUsers] = await Promise.all([
    getBoard(id),
    listTasksByBoard(id),
    listUsers(),
  ]);
  if (!board) {
    return NextResponse.json({ error: "Доска не найдена" }, { status: 404 });
  }
  if (!(await canAccessWorkspace(user, board.workspaceId))) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  // Исполнителем может быть любой участник пространства, а не только
  // тот, кто явно добавлен в саму доску.
  const workspaceMemberEmails = await listWorkspaceMemberEmails(board.workspaceId);
  const members = allUsers.filter((u) => workspaceMemberEmails.includes(u.email));

  // Недельное архивирование «Готово» — тяжёлая часть логики держим на
  // бэке (см. lib/week.ts), чтобы фронт просто получал уже отфильтрованный
  // список плюс перечень недель для пикера, без собственных вычислений дат.
  const doneWeek = request.nextUrl.searchParams.get("doneWeek") || getCurrentWeekKey();
  const doneWeeks = collectDoneWeeks(allTasks);
  const tasks = filterDoneTasksByWeek(allTasks, doneWeek);

  return NextResponse.json({ board, tasks, members, allUsers, doneWeek, doneWeeks });
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
  const existing = await getBoard(id);
  if (!existing) {
    return NextResponse.json({ error: "Доска не найдена" }, { status: 404 });
  }
  if (!(await canAccessWorkspace(user, existing.workspaceId))) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const parsed = updateBoardSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const board = await updateBoard(id, parsed.data);
  return NextResponse.json({ board });
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
  const board = await getBoard(id);
  if (!board) {
    return NextResponse.json({ error: "Доска не найдена" }, { status: 404 });
  }
  if (!(await canAccessWorkspace(user, board.workspaceId))) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const parsed = addMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const updated = await addBoardMember(id, parsed.data.email.toLowerCase());
  return NextResponse.json({ board: updated });
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
  const board = await getBoard(id);
  if (!board) {
    return NextResponse.json({ error: "Доска не найдена" }, { status: 404 });
  }
  if (!(await canAccessWorkspace(user, board.workspaceId))) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }
  await deleteBoard(id);
  return NextResponse.json({ ok: true });
}
