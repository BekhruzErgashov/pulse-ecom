import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import {
  listBoards,
  listTasksByBoard,
  listWorkspaces,
  listWorkspacesForUser,
} from "@/lib/data";
import { canAccessWorkspace } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { BoardsGrid } from "@/components/boards-grid";
import { BoardsBanner } from "@/components/boards-banner";
import { CalendarWidget } from "@/components/calendar-widget";
import { CharacterParty } from "@/components/character-party";
import { isGoogleCalendarConfigured, getTodayEventsForUser } from "@/lib/google-calendar";
import type { BoardWithProgress } from "@/lib/models";

export default async function WorkspaceBoardsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ calendar?: string; calendar_error?: string }>;
}) {
  const { workspaceId } = await params;
  const { calendar, calendar_error: calendarError } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!(await canAccessWorkspace(user, workspaceId))) notFound();

  const workspaces =
    user.role === "admin" ? await listWorkspaces() : await listWorkspacesForUser(user.email);

  const boards = await listBoards(workspaceId);
  const boardsWithProgress: BoardWithProgress[] = await Promise.all(
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

  // Виджет календаря — справа от основного контента, поэтому остальные
  // элементы страницы сдвинуты в чуть более узкую левую колонку.
  const calendarConfigured = isGoogleCalendarConfigured();
  const calendarStatus = calendarConfigured
    ? await getTodayEventsForUser(user.email)
    : ({ connected: false } as const);

  return (
    <AppShell
      user={user}
      workspaces={workspaces}
      currentWorkspaceId={workspaceId}
      active="boards"
      eyebrow="Команда"
      title="Доски задач"
      mainClassName="mx-auto flex max-w-[94rem] gap-6 px-6 py-10"
    >
        <div className="min-w-0 flex-1">
          <BoardsBanner workspaceId={workspaceId} />
          <BoardsGrid initialBoards={boardsWithProgress} workspaceId={workspaceId} />
        </div>
        <aside className="hidden w-52 shrink-0 lg:block">
          <div className="sticky top-10">
            <CalendarWidget
              workspaceId={workspaceId}
              configured={calendarConfigured}
              initialStatus={calendarStatus}
              calendarError={calendarError}
              justConnected={calendar === "connected"}
            />
          </div>
        </aside>
      <CharacterParty />
    </AppShell>
  );
}
