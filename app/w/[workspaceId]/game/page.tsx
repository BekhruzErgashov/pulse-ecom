import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listWorkspaces, listWorkspacesForUser } from "@/lib/data";
import { canAccessWorkspace } from "@/lib/access";
import { AppSidebar } from "@/components/app-sidebar";
import { GameBackdrop } from "@/components/game-backdrop";
import { GamePicker } from "@/components/game-picker";

export default async function WorkspaceGamePage({
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

  return (
    <div className="flex min-h-screen flex-col">
      <AppSidebar user={user} workspaces={workspaces} currentWorkspaceId={workspaceId} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-10">
        <GameBackdrop workspaceId={workspaceId} />
        <GamePicker workspaceId={workspaceId} />
      </main>
    </div>
  );
}
