import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getQuestion, listMessages, listUsers } from "@/lib/data";
import { canAccessWorkspace } from "@/lib/access";
import { AppSidebar } from "@/components/app-sidebar";
import { QuestionThread } from "@/components/question-thread";

export default async function WorkspaceQuestionPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>;
}) {
  const { workspaceId, id } = await params;
  const [user, question, messages, allUsers] = await Promise.all([
    getCurrentUser(),
    getQuestion(id),
    listMessages(id),
    listUsers(),
  ]);
  if (!user) redirect("/login");
  const isParticipant =
    question &&
    (question.authorEmail === user.email || question.recipientEmails.includes(user.email));
  if (!question || question.workspaceId !== workspaceId || !isParticipant) notFound();
  if (!(await canAccessWorkspace(user, workspaceId))) notFound();

  return (
    <div className="min-h-screen lg:pl-56">
      <AppSidebar user={user} currentWorkspaceId={workspaceId} />
      <main className="mx-auto max-w-2xl px-6 py-10">
        <Link
          href={`/w/${workspaceId}/questions`}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-3.5" /> Все вопросы
        </Link>
        <QuestionThread
          question={question}
          initialMessages={messages}
          currentUserEmail={user.email}
          allUsers={allUsers}
        />
      </main>
    </div>
  );
}
