import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listWorkspaces, listWorkspacesForUser, listWorkLinks } from "@/lib/data";
import { canAccessWorkspace } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { QuickLinks } from "@/components/quick-links";

export default async function WorkspaceLinksPage({
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
  const links = await listWorkLinks(workspaceId);

  return (
    <AppShell
      user={user}
      workspaces={workspaces}
      currentWorkspaceId={workspaceId}
      active="links"
      eyebrow="Команда"
      title="Ссылки"
      wrapperClassName="flex min-h-screen flex-col"
      mainClassName="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10"
    >
        <QuickLinks workspaceId={workspaceId} initialLinks={links} />
      </AppShell>
  );
}
