"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  KeyRound,
  LayoutGrid,
  Link2,
  ListChecks,
  LogOut,
  MessageCircleQuestion,
  Radio,
  Send,
  ShieldCheck,
  StickyNote,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { TelegramLinkDialog } from "@/components/telegram-link-dialog";
import { NotificationBell } from "@/components/notification-bell";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import type { User, Workspace } from "@/lib/models";

const NAV_LINKS = [
  { section: "boards", label: "Задачи", icon: LayoutGrid },
  { section: "my-tasks", label: "Мои задачи", icon: ListChecks },
  { section: "questions", label: "Вопросы", icon: MessageCircleQuestion },
];

function latestTimestamp(items: { updatedAt: string }[]): string {
  return items.reduce((max, item) => (item.updatedAt > max ? item.updatedAt : max), "");
}

export function TeamHeader({
  user,
  workspaces,
  currentWorkspaceId,
}: {
  user: User;
  workspaces?: Workspace[];
  currentWorkspaceId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [changePasswordOpen, setChangePasswordOpen] = React.useState(false);
  const [telegramOpen, setTelegramOpen] = React.useState(false);
  const [notice, setNotice] = React.useState<{ "my-tasks": boolean; questions: boolean }>({
    "my-tasks": false,
    questions: false,
  });

  // Проверяем, появилось ли что-то новое «для меня» с прошлого визита —
  // те же ключи last-seen, что проставляют сами страницы «Мои задачи» и
  // «Вопросы» при просмотре (см. my-tasks-board.tsx, questions-list.tsx).
  React.useEffect(() => {
    if (!currentWorkspaceId) return;
    let cancelled = false;
    async function check() {
      try {
        const [tasksRes, questionsRes] = await Promise.all([
          fetch(`/api/tasks/mine?workspaceId=${currentWorkspaceId}`),
          fetch(`/api/questions?workspaceId=${currentWorkspaceId}`),
        ]);
        const tasksData = tasksRes.ok ? await tasksRes.json() : { tasks: [] };
        const questionsData = questionsRes.ok ? await questionsRes.json() : { questions: [] };
        if (cancelled) return;
        const latestTasksAt = latestTimestamp(tasksData.tasks ?? []);
        const latestQuestionsAt = latestTimestamp(questionsData.questions ?? []);
        const lastSeenTasks = localStorage.getItem(`ttt_last_seen_my_tasks_${currentWorkspaceId}`) ?? "";
        const lastSeenQuestions =
          localStorage.getItem(`ttt_last_seen_questions_${currentWorkspaceId}`) ?? "";
        setNotice({
          "my-tasks": !!latestTasksAt && latestTasksAt > lastSeenTasks,
          questions: !!latestQuestionsAt && latestQuestionsAt > lastSeenQuestions,
        });
      } catch {
        // Бейджи необязательны — молча пропускаем сбой проверки.
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [currentWorkspaceId, pathname]);

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    toast.success("Вы вышли из аккаунта");
    router.push("/login");
    router.refresh();
  }

  return (
    // relative z-50 обязателен: backdrop-blur создаёт собственный контекст
    // наложения, из-за чего z-40 у выпадающих меню внутри шапки не поднимает
    // их над контентом страницы — меню профиля уезжало под виджет «Сегодня».
    <header className="relative z-50 border-b border-[var(--color-line)] bg-[var(--color-paper-raised)]/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <div className="flex items-center gap-6">
          <Link href="/boards" className="flex items-center gap-2">
            <Radio className="size-4 text-[var(--color-signal)]" />
            <span className="eyebrow">Пульс</span>
          </Link>
          {workspaces && workspaces.length > 0 && (
            <WorkspaceSwitcher workspaces={workspaces} currentWorkspaceId={currentWorkspaceId} />
          )}
        </div>

        <nav className="flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-paper)] p-1">
          {NAV_LINKS.map((link) => {
            const Icon = link.icon;
            const href = currentWorkspaceId
              ? `/w/${currentWorkspaceId}/${link.section}`
              : `/${link.section}`;
            const active = pathname?.includes(`/${link.section}`);
            const hasNotice = link.section === "my-tasks" || link.section === "questions"
              ? notice[link.section as "my-tasks" | "questions"]
              : false;
            return (
              <Link
                key={link.section}
                href={href}
                className={cn(
                  "relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-[var(--color-signal)] text-[var(--color-on-accent)] shadow-sm"
                    : "text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-raised)] hover:text-[var(--color-ink)]",
                )}
              >
                <Icon className="size-4" />
                {link.label}
                {hasNotice && (
                  <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-[var(--color-danger)] ring-2 ring-[var(--color-paper)]" />
                )}
              </Link>
            );
          })}
          {user.role === "admin" && (
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                pathname?.startsWith("/admin")
                  ? "bg-[var(--color-signal)] text-[var(--color-on-accent)] shadow-sm"
                  : "text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-raised)] hover:text-[var(--color-ink)]",
              )}
            >
              <ShieldCheck className="size-4" />
              Админ
            </Link>
          )}
          <Link
            href="/notes"
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              pathname?.startsWith("/notes")
                ? "bg-[var(--color-signal)] text-[var(--color-on-accent)] shadow-sm"
                : "text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-raised)] hover:text-[var(--color-ink)]",
            )}
          >
            <StickyNote className="size-4" />
            Мои заметки
          </Link>
          <Link
            href={currentWorkspaceId ? `/w/${currentWorkspaceId}/links` : "/links"}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
              pathname?.includes("/links")
                ? "bg-[var(--color-signal)] text-[var(--color-on-accent)] shadow-sm"
                : "text-[var(--color-ink-soft)] hover:bg-[var(--color-paper-raised)] hover:text-[var(--color-ink)]",
            )}
          >
            <Link2 className="size-4" />
            Ссылки
          </Link>
        </nav>

        <div className="flex items-center gap-1">
          <ThemeToggle />
          <NotificationBell />

          <DropdownMenu>
            <DropdownMenuTrigger>
              <button className="flex items-center gap-2 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-signal)]">
                <Avatar name={user.name} color={user.color} size="sm" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <div className="px-2 py-1.5 text-sm">
                <div className="font-medium">{user.name}</div>
                <div className="text-xs text-[var(--color-ink-soft)]">{user.email}</div>
              </div>
              <DropdownMenuItem onClick={() => setTelegramOpen(true)}>
                <Send className="size-3.5" /> Telegram-бот
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setChangePasswordOpen(true)}>
                <KeyRound className="size-3.5" /> Сменить пароль
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} variant="destructive">
                <LogOut className="size-3.5" /> Выйти
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
      <TelegramLinkDialog open={telegramOpen} onOpenChange={setTelegramOpen} />
    </header>
  );
}
