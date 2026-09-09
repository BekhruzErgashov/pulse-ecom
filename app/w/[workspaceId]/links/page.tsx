import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listWorkspaces, listWorkspacesForUser, listWorkLinks } from "@/lib/data";
import { canAccessWorkspace } from "@/lib/access";
import { AppSidebar } from "@/components/app-sidebar";
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
    <div className="flex min-h-screen flex-col">
      <AppSidebar user={user} workspaces={workspaces} currentWorkspaceId={workspaceId} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10">
        <QuickLinks workspaceId={workspaceId} initialLinks={links} />
      </main>
    </div>
  );
}
