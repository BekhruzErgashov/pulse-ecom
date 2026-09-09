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

/**
 * Постоянное меню слева. Раньше навигация жила в верхней полосе, но при
 * работе с доской горизонтальное место дороже вертикального: колонки
 * канбана и правая сводка занимают всю ширину, а сверху оставалась пустая
 * лента. Панель фиксированная, на узких экранах прячется в верхнюю полосу.
 */
const NAV_LINKS = [
  { section: "boards", label: "Доски", icon: LayoutGrid },
  { section: "my-tasks", label: "Мои задачи", icon: ListChecks },
  { section: "questions", label: "Вопросы", icon: MessageCircleQuestion },
  { section: "notes", label: "Заметки", icon: StickyNote, absolute: "/notes" },
  { section: "links", label: "Ссылки", icon: Link2 },
] as const;

function latestTimestamp(items: { updatedAt: string }[]): string {
  return items.reduce((max, item) => (item.updatedAt > max ? item.updatedAt : max), "");
}

export function AppSidebar({
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

  // Те же ключи last-seen, что проставляют страницы «Мои задачи» и «Вопросы»
  // при просмотре — точка на пункте меню показывает, что появилось новое.
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
        const lastSeenTasks =
          localStorage.getItem(`ttt_last_seen_my_tasks_${currentWorkspaceId}`) ?? "";
        const lastSeenQuestions =
          localStorage.getItem(`ttt_last_seen_questions_${currentWorkspaceId}`) ?? "";
        setNotice({
          "my-tasks": !!latestTasksAt && latestTasksAt > lastSeenTasks,
          questions: !!latestQuestionsAt && latestQuestionsAt > lastSeenQuestions,
        });
      } catch {
        // Точки необязательны — молча пропускаем сбой проверки.
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

  const links = NAV_LINKS.map((link) => {
    const href =
      "absolute" in link && link.absolute
        ? link.absolute
        : currentWorkspaceId
          ? `/w/${currentWorkspaceId}/${link.section}`
          : `/${link.section}`;
    const active = pathname?.includes(`/${link.section}`);
    const hasNotice =
      link.section === "my-tasks" || link.section === "questions"
        ? notice[link.section as "my-tasks" | "questions"]
        : false;
    return { ...link, href, active, hasNotice };
  });

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-[var(--color-line)] bg-[var(--color-paper-raised)]/60 backdrop-blur lg:flex">
        <Link href="/boards" className="flex items-center gap-2 px-5 py-5">
          <span className="flex size-8 items-center justify-center rounded-xl bg-[var(--color-signal-soft)]">
            <Radio className="size-4 text-[var(--color-signal)]" />
          </span>
          <span className="text-base font-semibold tracking-tight">Пульс</span>
        </Link>

        {workspaces && workspaces.length > 0 && (
          <div className="px-3 pb-3">
            <WorkspaceSwitcher workspaces={workspaces} currentWorkspaceId={currentWorkspaceId} />
          </div>
        )}

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.section}
                href={link.href}
                className={cn(
                  "relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  link.active
                    ? "bg-[var(--color-signal)] text-[var(--color-on-accent)] shadow-sm"
                    : "text-[var(--color-ink-soft)] hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)]",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {link.label}
                {link.hasNotice && (
                  <span className="ml-auto size-2 rounded-full bg-[var(--color-danger)]" />
                )}
              </Link>
            );
          })}

          {user.role === "admin" && (
            <Link
              href="/admin"
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                pathname?.startsWith("/admin")
                  ? "bg-[var(--color-signal)] text-[var(--color-on-accent)] shadow-sm"
                  : "text-[var(--color-ink-soft)] hover:bg-[var(--color-paper)] hover:text-[var(--color-ink)]",
              )}
            >
              <ShieldCheck className="size-4 shrink-0" />
              Админ
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-1 border-t border-[var(--color-line)] px-3 py-3">
          <DropdownMenu>
            <DropdownMenuTrigger>
              <button className="flex flex-1 items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-paper)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-signal)]">
                <Avatar name={user.name} color={user.color} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{user.name}</span>
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
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
          <ThemeToggle />
          <NotificationBell />
        </div>
      </aside>

      {/* Узкие экраны: панель не помещается, оставляем компактную верхнюю полосу. */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-[var(--color-line)] bg-[var(--color-paper-raised)]/80 px-4 py-2.5 backdrop-blur lg:hidden">
        <Link href="/boards" className="flex items-center gap-2">
          <Radio className="size-4 text-[var(--color-signal)]" />
          <span className="text-sm font-semibold">Пульс</span>
        </Link>
        <nav className="flex items-center gap-1 overflow-x-auto">
          {links.map((link) => {
            const Icon = link.icon;
            return (
              <Link
                key={link.section}
                href={link.href}
                aria-label={link.label}
                className={cn(
                  "relative flex size-9 items-center justify-center rounded-xl transition-colors",
                  link.active
                    ? "bg-[var(--color-signal)] text-[var(--color-on-accent)]"
                    : "text-[var(--color-ink-soft)] hover:bg-[var(--color-paper)]",
                )}
              >
                <Icon className="size-4" />
                {link.hasNotice && (
                  <span className="absolute right-1 top-1 size-1.5 rounded-full bg-[var(--color-danger)]" />
                )}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <NotificationBell />
          <DropdownMenu>
            <DropdownMenuTrigger>
              <button className="flex items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-signal)]">
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
      </header>

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
      <TelegramLinkDialog open={telegramOpen} onOpenChange={setTelegramOpen} />
    </>
  );
}
