import "server-only";
import { isWorkspaceMember } from "@/lib/data";
import type { User } from "@/lib/models";

export async function canAccessWorkspace(user: User, workspaceId: string): Promise<boolean> {
  if (user.role === "admin") return true;
  return isWorkspaceMember(workspaceId, user.email);
}
