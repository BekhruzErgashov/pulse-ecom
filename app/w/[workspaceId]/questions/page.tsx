import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import {
  listQuestionsForUser,
  listUsers,
  listWorkspaceMemberEmails,
  listWorkspaces,
  listWorkspacesForUser,
} from "@/lib/data";
import { canAccessWorkspace } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { QuestionsList } from "@/components/questions-list";

export default async function WorkspaceQuestionsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await canAccessWorkspace(user, workspaceId))) notFound();

  const workspaces =
    user.role === "admin" ? await listWorkspaces() : await listWorkspacesForUser(user.email);

  const [questions, allUsers, workspaceMemberEmails] = await Promise.all([
    listQuestionsForUser(workspaceId, user.email),
    listUsers(),
    listWorkspaceMemberEmails(workspaceId),
  ]);

  // Получателем вопроса может быть только участник того же пространства —
  // это и есть граница конфиденциальности между командами.
  const teamMembers = allUsers.filter(
    (u) => u.email !== user.email && workspaceMemberEmails.includes(u.email),
  );

  return (
    <AppShell
      user={user}
      workspaces={workspaces}
      currentWorkspaceId={workspaceId}
      active="questions"
      eyebrow="Личное"
      title="Вопросы"
      mainClassName="mx-auto max-w-4xl px-6 py-10"
    >
        <div className="mb-8">
          <p className="eyebrow mb-1">Личное</p>
          <h1 className="text-2xl font-semibold tracking-tight">Вопросы</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-soft)]">
            Здесь видны только вопросы, которые задали вы, или те, что
            адресованы вам — в рамках этого пространства.
          </p>
        </div>
        <QuestionsList
          currentUserEmail={user.email}
          initialQuestions={questions}
          teamMembers={teamMembers}
          workspaceId={workspaceId}
        />
      </AppShell>
  );
}
