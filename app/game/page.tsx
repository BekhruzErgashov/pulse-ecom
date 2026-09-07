import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { listWorkspaces, listWorkspacesForUser } from "@/lib/data";
import { canAccessWorkspace } from "@/lib/access";

export default async function GameRedirectPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const workspaces =
    user.role === "admin" ? await listWorkspaces() : await listWorkspacesForUser(user.email);
  if (workspaces.length === 0) redirect("/boards");

  const jar = await cookies();
  const savedWs = jar.get("ttt_current_ws")?.value;
  const targetWs =
    savedWs && (await canAccessWorkspace(user, savedWs)) ? savedWs : workspaces[0].id;

  redirect(`/w/${targetWs}/game`);
}
