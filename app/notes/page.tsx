import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listNoteFolders, listNotes } from "@/lib/data";
import { AppSidebar } from "@/components/app-sidebar";
import { NotesApp } from "@/components/notes-app";

export default async function NotesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [folders, notes] = await Promise.all([listNoteFolders(user.email), listNotes(user.email)]);

  return (
    <div className="flex min-h-screen flex-col">
      <AppSidebar user={user} />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-6 py-8">
        <div className="mb-6">
          <p className="eyebrow mb-1">Личное</p>
          <h1 className="text-2xl font-semibold tracking-tight">Мои заметки</h1>
          <p className="mt-1 text-sm text-[var(--color-ink-soft)]">
            Эти заметки видны только вам — ни команда, ни администратор их не видят.
          </p>
        </div>
        <NotesApp initialFolders={folders} initialNotes={notes} />
      </main>
    </div>
  );
}
