import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getWorkspace, listMyTasksInWorkspace, listUsers, listWorkspaceMemberEmails } from "@/lib/data";
import { canAccessWorkspace } from "@/lib/access";
import { collectDoneWeeks, filterDoneTasksByWeek, getCurrentWeekKey } from "@/lib/week";
import { AppSidebar } from "@/components/app-sidebar";
import { MyTasksBoard } from "@/components/my-tasks-board";

export default async function MyTasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ taskId?: string }>;
}) {
  const { workspaceId } = await params;
  const { taskId } = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) notFound();
  if (!(await canAccessWorkspace(user, workspaceId))) notFound();

  const [allTasks, allUsers, workspaceMemberEmails] = await Promise.all([
    listMyTasksInWorkspace(workspaceId, user.email),
    listUsers(),
    listWorkspaceMemberEmails(workspaceId),
  ]);

  // Исполнителем задачи может быть любой участник пространства — та же
  // логика, что и на обычной доске.
  const members = allUsers.filter((u) => workspaceMemberEmails.includes(u.email));

  // Та же недельная фильтрация «Готово», что и на доске (см. lib/week.ts).
  // Если открываем по ссылке из уведомления задачу прошлой недели —
  // не прячем её, иначе диалог откроется на пустом месте.
  const doneWeek = getCurrentWeekKey();
  const doneWeeks = collectDoneWeeks(allTasks);
  let tasks = filterDoneTasksByWeek(allTasks, doneWeek);
  if (taskId && !tasks.some((t) => t.id === taskId)) {
    const pinned = allTasks.find((t) => t.id === taskId);
    if (pinned) tasks = [...tasks, pinned];
  }

  return (
    <div className="min-h-screen lg:pl-56">
      <AppSidebar user={user} currentWorkspaceId={workspaceId} />
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Link
          href={`/w/${workspaceId}/boards`}
          className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-soft)] shadow-sm transition-colors hover:border-[var(--color-signal)] hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-3.5" /> Все доски
        </Link>
        <div className="mb-6">
          <p className="eyebrow mb-1">Сводная доска</p>
          <h1 className="text-2xl font-semibold tracking-tight">Мои задачи</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Все задачи, назначенные на вас, со всех досок пространства «{workspace.name}». Изменения
            здесь сразу отражаются на исходных досках.
          </p>
        </div>
        <MyTasksBoard
          workspaceId={workspaceId}
          initialTasks={tasks}
          initialDoneWeek={doneWeek}
          initialDoneWeeks={doneWeeks}
          allUsers={members}
          currentUserEmail={user.email}
          initialOpenTaskId={taskId}
        />
      </main>
    </div>
  );
}
