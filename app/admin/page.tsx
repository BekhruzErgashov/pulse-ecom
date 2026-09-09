import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listAllowedEmails, listUsers, listWorkspaces } from "@/lib/data";
import { AppShell } from "@/components/app-shell";
import { AdminPanel } from "@/components/admin-panel";

export default async function AdminPage() {
  const [admin, allowedEmails, users, workspaces] = await Promise.all([
    getCurrentUser(),
    listAllowedEmails(),
    listUsers(),
    listWorkspaces(),
  ]);
  if (!admin || admin.role !== "admin") redirect("/boards");

  return (
    <AppShell
      user={admin}
      active="admin"
      eyebrow="Администрирование"
      title="Доступы и команда"
      mainClassName="mx-auto max-w-4xl px-6 py-10"
    >
        <div className="mb-8">
          <p className="eyebrow mb-1">Администрирование</p>
          <h1 className="text-2xl font-semibold tracking-tight">Доступы и команда</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-ink-soft)]">
            Управляйте тем, кто может зарегистрироваться, ролями участников и
            пространствами для разных команд.
          </p>
        </div>
        <AdminPanel
          currentUserEmail={admin.email}
          initialAllowedEmails={allowedEmails}
          initialUsers={users}
          initialWorkspaces={workspaces}
        />
      </AppShell>
  );
}
