import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { listWorkspaces, listWorkspacesForUser, seedIfEmpty } from "@/lib/data";
import { canAccessWorkspace } from "@/lib/access";
import { AppSidebar } from "@/components/app-sidebar";
import { NoWorkspaceState } from "@/components/no-workspace-state";

// /boards без ID пространства — определяем, куда вести (последнее выбранное
// пространство из cookie, иначе первое доступное), и уводим на /w/[id]/boards.
// Пространство закреплено прямо в пути, а не в query-параметре — так
// Next.js гарантированно не путает кэш между разными командами.
export default async function BoardsRedirectPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let workspaces =
    user.role === "admin" ? await listWorkspaces() : await listWorkspacesForUser(user.email);

  if (workspaces.length === 0) {
    await seedIfEmpty();
    workspaces =
      user.role === "admin" ? await listWorkspaces() : await listWorkspacesForUser(user.email);
  }

  if (workspaces.length === 0) {
    return (
      <div className="min-h-screen lg:pl-56">
        <AppSidebar user={user} />
        <main className="mx-auto max-w-6xl px-6 py-10">
          <NoWorkspaceState isAdmin={user.role === "admin"} />
        </main>
      </div>
    );
  }

  const jar = await cookies();
  const savedWs = jar.get("ttt_current_ws")?.value;
  const targetWs =
    savedWs && (await canAccessWorkspace(user, savedWs)) ? savedWs : workspaces[0].id;

  redirect(`/w/${targetWs}/boards`);
}
