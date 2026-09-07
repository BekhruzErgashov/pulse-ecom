import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getBoard, listTasksByBoard, listUsers, listWorkspaceMemberEmails } from "@/lib/data";
import { canAccessWorkspace } from "@/lib/access";
import { collectDoneWeeks, filterDoneTasksByWeek, getCurrentWeekKey } from "@/lib/week";
import { TeamHeader } from "@/components/team-header";
import { KanbanBoard } from "@/components/kanban-board";
import { BoardHeaderActions } from "@/components/board-header-actions";

export default async function WorkspaceBoardPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>;
}) {
  const { workspaceId, id } = await params;
  const [user, board, allTasks, allUsers] = await Promise.all([
    getCurrentUser(),
    getBoard(id),
    listTasksByBoard(id),
    listUsers(),
  ]);
  if (!user) redirect("/login");
  if (!board || board.workspaceId !== workspaceId) notFound();
  if (!(await canAccessWorkspace(user, workspaceId))) notFound();

  // Исполнителем может быть любой участник пространства, а не только
  // тот, кто явно добавлен в саму доску — это одна команда.
  const workspaceMemberEmails = await listWorkspaceMemberEmails(workspaceId);
  const members = allUsers.filter((u) => workspaceMemberEmails.includes(u.email));

  // На SSR отдаём ту же текущую неделю, что и клиентский поллинг по
  // умолчанию — иначе первая отрисовка «моргнёт» лишними готовыми
  // задачами прошлых недель (см. lib/week.ts).
  const doneWeek = getCurrentWeekKey();
  const doneWeeks = collectDoneWeeks(allTasks);
  const tasks = filterDoneTasksByWeek(allTasks, doneWeek);

  return (
    <div className="min-h-screen">
      <TeamHeader user={user} currentWorkspaceId={workspaceId} />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link
          href={`/w/${workspaceId}/boards`}
          className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-soft)] shadow-sm transition-colors hover:border-[var(--color-signal)] hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-3.5" /> Все доски
        </Link>
        <BoardHeaderActions board={board} />
        <KanbanBoard
          boardId={board.id}
          initialTasks={tasks}
          initialDoneWeek={doneWeek}
          initialDoneWeeks={doneWeeks}
          members={members}
          allUsers={allUsers}
          currentUserEmail={user.email}
        />
      </main>
    </div>
  );
}
