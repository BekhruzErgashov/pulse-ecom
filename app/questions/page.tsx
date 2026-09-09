import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { listWorkspaces, listWorkspacesForUser } from "@/lib/data";
import { canAccessWorkspace } from "@/lib/access";
import { AppShell } from "@/components/app-shell";
import { NoWorkspaceState } from "@/components/no-workspace-state";

export default async function QuestionsRedirectPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspaces =
    user.role === "admin" ? await listWorkspaces() : await listWorkspacesForUser(user.email);

  if (workspaces.length === 0) {
    return (
      <AppShell
        user={user}
        active="questions"
        eyebrow="Личное"
        title="Вопросы"
        mainClassName="mx-auto max-w-4xl px-6 py-10"
      >
          <NoWorkspaceState isAdmin={user.role === "admin"} />
        </AppShell>
  );
  }

  const jar = await cookies();
  const savedWs = jar.get("ttt_current_ws")?.value;
  const targetWs =
    savedWs && (await canAccessWorkspace(user, savedWs)) ? savedWs : workspaces[0].id;

  redirect(`/w/${targetWs}/questions`);
}
