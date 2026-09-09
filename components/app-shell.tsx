"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Columns3,
  KeyRound,
  LayoutGrid,
  Link2,
  ListChecks,
  LogOut,
  MessageCircleQuestion,
  Moon,
  Send,
  ShieldCheck,
  StickyNote,
  Sun,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TeamHeader } from "@/components/team-header";
import { ChangePasswordDialog } from "@/components/change-password-dialog";
import { TelegramLinkDialog } from "@/components/telegram-link-dialog";
import { NotificationBell } from "@/components/notification-bell";
import { GlobalSearch } from "@/components/global-search";
import { BokehBackground } from "@/components/bokeh-background";
import type { User, Workspace } from "@/lib/models";

type NavSection = "boards" | "board" | "questions" | "notes" | "links" | "admin" | "my-tasks";

const RAIL_ITEMS: { section: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { section: "boards", label: "Доски", icon: LayoutGrid },
  { section: "questions", label: "Вопросы", icon: MessageCircleQuestion },
  { section: "notes", label: "Заметки", icon: StickyNote },
  { section: "links", label: "Ссылки", icon: Link2 },
];

/**
 * Единый app shell редизайна «Dark Liquid-Glass» (см. HANDOFF.md) —
 * 80px-й иконочный сайдбар слева + топбар (eyebrow/H1/поиск/Доски-Доска
 * пилюля) справа. Заменяет собой И team-header.tsx (горизонтальную шапку,
 * стоявшую на ВСЕХ экранах), И board-page-shell.tsx/board-sidebar.tsx
 * (прежний тёмный сайдбар, стоявший ТОЛЬКО на экране одной доски) — теперь
 * один и тот же компонент на каждом экране приложения, темы просто
 * переключают его внутреннее содержимое.
 *
 * В светлой теме (и до монтирования — см. TeamHeader/BoardPageShell,
 * тот же trade-off с SSR-первым-кадром) рендерит РОВНО старую шапку
 * team-header.tsx + <main>, один в один как было — светлая тема этим
 * редизайном не затронута ни на пиксель, только тёмная.
 */
export function AppShell({
  user,
  workspaces,
  currentWorkspaceId,
  active,
  eyebrow,
  title,
  boardHref,
  topbarBanner,
  wrapperClassName = "min-h-screen",
  mainClassName = "mx-auto max-w-6xl px-6 py-10",
  children,
}: {
  user: User;
  workspaces?: Workspace[];
  currentWorkspaceId?: string;
  active: NavSection;
  eyebrow: string;
  title: string;
  /** Известен только на экране одной доски — включает пилюлю Доски/Доска в топбаре. */
  boardHref?: string;
  /** Баннер прямо в топбаре, между заголовком и поиском (только доски-
   *  список) — по разметке пользователя (красная рамка на скриншоте):
   *  заполняет весь горизонтальный зазор между заголовком и поиском, не
   *  на всю ширину страницы. Игнорируется в светлой теме (топбар — только
   *  тёмная тема). */
  topbarBanner?: React.ReactNode;
  wrapperClassName?: string;
  mainClassName?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme, theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const isDarkGlass = mounted && resolvedTheme === "dark-glass";

  const [changePasswordOpen, setChangePasswordOpen] = React.useState(false);
  const [telegramOpen, setTelegramOpen] = React.useState(false);

  // Иконка «Доска» в сайдбаре — по правке пользователя, показывается ТОЛЬКО
  // когда человек реально находится внутри экрана доски (active === "board"),
  // а не на всех экранах подряд, как было раньше. На остальных экранах на
  // её месте — кнопка «Мои задачи» (см. рендер ниже). lastBoardHref всё
  // ещё нужен: именно на него ведёт иконка «Доска», когда она видна.
  const lastBoardKey = currentWorkspaceId ? `ttt_last_board_${currentWorkspaceId}` : null;
  const [lastBoardHref, setLastBoardHref] = React.useState<string | undefined>(boardHref);
  React.useEffect(() => {
    if (!lastBoardKey) return;
    if (boardHref) {
      localStorage.setItem(lastBoardKey, boardHref);
      setLastBoardHref(boardHref);
    } else {
      setLastBoardHref(localStorage.getItem(lastBoardKey) ?? undefined);
    }
  }, [boardHref, lastBoardKey]);

  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    toast.success("Вы вышли из аккаунта");
    router.push("/login");
    router.refresh();
  }

  if (!isDarkGlass) {
    return (
      <div className={wrapperClassName}>
        <TeamHeader user={user} workspaces={workspaces} currentWorkspaceId={currentWorkspaceId} />
        <main className={mainClassName}>{children}</main>
      </div>
    );
  }

  function sectionHref(section: NavSection): string {
    if (section === "board") return lastBoardHref ?? (currentWorkspaceId ? `/w/${currentWorkspaceId}/boards` : "/boards");
    if (section === "admin") return "/admin";
    if (section === "notes") return "/notes";
    return currentWorkspaceId ? `/w/${currentWorkspaceId}/${section}` : `/${section}`;
  }

  const otherWorkspaces = (workspaces ?? []).filter((w) => w.id !== currentWorkspaceId);

  function switchWorkspace(workspaceId: string) {
    // Тот же приём, что в workspace-switcher.tsx.
    // eslint-disable-next-line react-hooks/immutability
    document.cookie = `ttt_current_ws=${workspaceId}; path=/; max-age=${60 * 60 * 24 * 365}`;
    const section = pathname?.includes("/questions") ? "questions" : "boards";
    router.push(`/w/${workspaceId}/${section}`);
  }

  return (
    <div className="relative flex min-h-screen" style={{ background: "#060613" }}>
      <BokehBackground />

      {/* Колокольчик уведомлений теперь не здесь — он в верхнем правом
          углу экрана (fixed), см. ниже перед </main>. */}

      {/* overflow-y-auto здесь нарочно НЕ ставим — меню профиля
          (ui/dropdown-menu.tsx) рисует свою всплывашку обычным
          DOM-потомком этого сайдбара (не через портал), а не отдельным
          слоем; overflow-y (в любую сторону, кроме visible) у родителя
          обрезал бы её сбоку — ровно то, из-за чего окно уведомлений
          «терялось» после того, как сайдбар стал sticky/h-screen (тогда
          колокольчик ещё жил в сайдбаре). Список пунктов и так
          фиксированный и короткий — реальной вертикальной прокрутки ему
          не нужно.

          group + hover:w-[205px] — по правке пользователя: при наведении
          колонка расширяется вправо (overflow-hidden держит контент
          коллапс-ширины, пока не наведут) и у иконок появляются подписи
          (span.label ниже, opacity/max-w на group-hover). Левый отступ
          фиксирован (px-[18px]) и не зависит от состояния — иконки не
          «прыгают» при расширении, вправо просто открывается место под
          текст. Сначала сузили до 186px (-40% от исходных 256px), но на
          186px самая длинная подпись «Мои задачи» не помещалась и
          обрезалась текстом — увеличили до 205px, этого хватает под
          «Мои задачи» целиком (см. group-hover:max-w-[113px] ниже) и
          сайдбар всё равно заметно уже исходного. box-border на span.label
          — иначе при box-sizing:content-box паддинг pr-3 не схлопывался
          вместе с max-w-0 в свёрнутом виде и вылезал за иконку цветным
          обрубком (баг с «обрезанным» активным квадратом «Доски»).

          fixed (не sticky) + отдельный span-заглушка ниже — по правке
          пользователя: раньше сайдбар был обычным flex-элементом рядом с
          <main>, поэтому расширение при наведении СЖИМАЛО контент экрана
          (flex-1 у main пересчитывал ширину). Теперь сам <aside> — fixed
          поверх всего (z-30, выше main’а и колокольчика), а в потоке
          вместо него остаётся только неподвижная заглушка шириной с
          свёрнутый сайдбар (w-20) — она резервирует под него место слева,
          но сама никогда не меняет размер, так что <main> не «прыгает» и
          не сжимается при наведении; расширенный сайдбар просто
          перекрывает часть контента сверху. */}
      <div className="w-20 shrink-0" aria-hidden="true" />
      <aside
        className="group fixed top-0 left-0 z-30 flex h-screen w-20 shrink-0 flex-col gap-1.5 overflow-hidden px-[18px] py-5 transition-[width] duration-200 ease-out hover:w-[205px]"
        style={{
          background: "rgba(255,255,255,0.035)",
          backdropFilter: "blur(28px) saturate(140%)",
          WebkitBackdropFilter: "blur(28px) saturate(140%)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {/* Логотип «Пульс» — по правке пользователя, больше НЕ выглядит
            как активная синяя пилюля (это просто бренд-иконка, не пункт
            навигации с состоянием «выбрано»); фон прозрачный, узнаваемость
            держится на акцентном цвете самой иконки. */}
        <Link
          href={sectionHref("boards")}
          title="Пульс — все доски"
          aria-label="Пульс — все доски"
          className="mb-2.5 flex h-[42px] w-fit shrink-0 items-center gap-3 rounded-[14px]"
          style={{ background: "transparent" }}
        >
          <span className="flex size-[42px] shrink-0 items-center justify-center">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="9" stroke="var(--color-signal)" strokeWidth="1.6" />
              <circle cx="12" cy="12" r="3" fill="var(--color-signal)" />
            </svg>
          </span>
          <span className="max-w-0 box-border overflow-hidden text-ellipsis pr-3 text-[13px] font-bold whitespace-nowrap text-white opacity-0 transition-all duration-200 group-hover:max-w-[113px] group-hover:opacity-100">
            Пульс
          </span>
        </Link>

        <nav className="flex flex-col gap-1.5">
          {RAIL_ITEMS.map((item) => {
            const isActive = active === item.section;
            const Icon = item.icon;
            const link = (
              <Link
                key={item.section}
                href={sectionHref(item.section)}
                title={item.label}
                aria-label={item.label}
                className="flex h-11 w-fit shrink-0 items-center gap-3 rounded-[13px] transition-colors"
                style={{
                  background: isActive ? "linear-gradient(155deg, var(--color-signal), var(--color-signal-deep))" : "transparent",
                  color: isActive ? "#ffffff" : "#7e7d99",
                }}
              >
                <span className="flex size-11 shrink-0 items-center justify-center">
                  <Icon className="size-[18px]" />
                </span>
                <span className="max-w-0 box-border overflow-hidden text-ellipsis pr-3 text-[13px] font-semibold whitespace-nowrap opacity-0 transition-all duration-200 group-hover:max-w-[113px] group-hover:opacity-100">
                  {item.label}
                </span>
              </Link>
            );
            if (item.section !== "boards") return link;
            // Сразу после «Доски»: «Доска» — только когда реально внутри
            // экрана доски; на всех остальных экранах вместо неё — «Мои
            // задачи» (по правке пользователя).
            return (
              <React.Fragment key="boards-and-secondary">
                {link}
                {active === "board" ? (
                  <Link
                    href={sectionHref("board")}
                    title="Доска"
                    aria-label="Доска"
                    className="flex h-11 w-fit shrink-0 items-center gap-3 rounded-[13px] transition-colors"
                    style={{
                      background: "linear-gradient(155deg, var(--color-signal), var(--color-signal-deep))",
                      color: "#ffffff",
                    }}
                  >
                    <span className="flex size-11 shrink-0 items-center justify-center">
                      <Columns3 className="size-[18px]" />
                    </span>
                    <span className="max-w-0 box-border overflow-hidden text-ellipsis pr-3 text-[13px] font-semibold whitespace-nowrap opacity-0 transition-all duration-200 group-hover:max-w-[113px] group-hover:opacity-100">
                      Доска
                    </span>
                  </Link>
                ) : (
                  currentWorkspaceId && (
                    <Link
                      href={sectionHref("my-tasks")}
                      title="Мои задачи"
                      aria-label="Мои задачи"
                      className="flex h-11 w-fit shrink-0 items-center gap-3 rounded-[13px] transition-colors"
                      style={{
                        background:
                          active === "my-tasks"
                            ? "linear-gradient(155deg, var(--color-signal), var(--color-signal-deep))"
                            : "transparent",
                        color: active === "my-tasks" ? "#ffffff" : "#7e7d99",
                      }}
                    >
                      <span className="flex size-11 shrink-0 items-center justify-center">
                        <ListChecks className="size-[18px]" />
                      </span>
                      <span className="max-w-0 box-border overflow-hidden text-ellipsis pr-3 text-[13px] font-semibold whitespace-nowrap opacity-0 transition-all duration-200 group-hover:max-w-[113px] group-hover:opacity-100">
                        Мои задачи
                      </span>
                    </Link>
                  )
                )}
              </React.Fragment>
            );
          })}
          {user.role === "admin" && (
            <Link
              href="/admin"
              title="Админ"
              aria-label="Админ"
              className="flex h-11 w-fit shrink-0 items-center gap-3 rounded-[13px] transition-colors"
              style={{
                background: active === "admin" ? "linear-gradient(155deg, var(--color-signal), var(--color-signal-deep))" : "transparent",
                color: active === "admin" ? "#ffffff" : "#7e7d99",
              }}
            >
              <span className="flex size-11 shrink-0 items-center justify-center">
                <ShieldCheck className="size-[18px]" />
              </span>
              <span className="max-w-0 box-border overflow-hidden text-ellipsis pr-3 text-[13px] font-semibold whitespace-nowrap opacity-0 transition-all duration-200 group-hover:max-w-[113px] group-hover:opacity-100">
                Админ
              </span>
            </Link>
          )}
        </nav>

        <div className="flex-1" />

        <DropdownMenu>
          <DropdownMenuTrigger>
            <button
              className="flex h-11 w-fit shrink-0 items-center gap-3 rounded-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-signal)]"
              aria-label="Профиль"
            >
              <span className="flex size-11 shrink-0 items-center justify-center">
                <Avatar name={user.name} color={user.color ?? "#5b9dff"} size="md" />
              </span>
              <span className="max-w-0 box-border overflow-hidden text-ellipsis pr-3 text-left text-[13px] font-semibold whitespace-nowrap text-white opacity-0 transition-all duration-200 group-hover:max-w-[113px] group-hover:opacity-100">
                {user.name}
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start">
            <div className="px-2 py-1.5 text-sm">
              <div className="font-medium">{user.name}</div>
              <div className="text-xs text-[var(--color-ink-soft)]">{user.email}</div>
            </div>
            {otherWorkspaces.length > 0 && (
              <>
                {otherWorkspaces.map((w) => (
                  <DropdownMenuItem key={w.id} onClick={() => switchWorkspace(w.id)}>
                    <LayoutGrid className="size-3.5" /> {w.name}
                  </DropdownMenuItem>
                ))}
              </>
            )}
            <DropdownMenuItem onClick={() => setTelegramOpen(true)}>
              <Send className="size-3.5" /> Telegram-бот
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setChangePasswordOpen(true)}>
              <KeyRound className="size-3.5" /> Сменить пароль
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme(theme === "dark-glass" ? "light" : "dark-glass")}>
              {theme === "dark-glass" ? (
                <>
                  <Sun className="size-3.5" /> Светлая тема
                </>
              ) : (
                <>
                  <Moon className="size-3.5" /> Тёмная тема
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout} variant="destructive">
              <LogOut className="size-3.5" /> Выйти
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </aside>

      {/* Колокольчик уведомлений — по правке пользователя, теперь в
          верхнем правом углу экрана (fixed, не в потоке сайдбара/топбара),
          виден на любом экране независимо от прокрутки. align="end"
          (значение по умолчанию) разворачивает панель влево от кнопки —
          так она не улетает за правый край экрана из самого угла. */}
      <div
        className="fixed top-5 right-6 z-20 flex size-10 items-center justify-center rounded-full"
        style={{
          background: "rgba(255,255,255,0.06)",
          backdropFilter: "blur(20px) saturate(140%)",
          WebkitBackdropFilter: "blur(20px) saturate(140%)",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "#e7e6f5",
        }}
      >
        <NotificationBell />
      </div>

      <main className="relative z-10 flex min-w-0 flex-1 flex-col gap-[26px] px-11 py-9">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="font-label m-0 mb-2 text-[11px] tracking-[0.14em] uppercase" style={{ color: "#7e7d99" }}>
              {eyebrow}
            </p>
            {/* 30px→42px, semibold→bold — тот же жест, что у заголовка
                Task View: самый крупный текст на каждой странице должен
                реально выглядеть крупным, а не «чуть больше обычного». */}
            <h1 className="font-display m-0 text-[42px] leading-[1.05] font-bold tracking-[-0.02em] text-white">
              {title}
            </h1>
          </div>

          {topbarBanner && <div className="min-w-[220px] flex-1 self-stretch">{topbarBanner}</div>}

          {(active === "boards" || active === "board") && (
            <div className="flex items-center gap-2.5">
              {currentWorkspaceId && <GlobalSearch workspaceId={currentWorkspaceId} />}
              {boardHref && (
                <div
                  className="flex items-center gap-0.5 rounded-xl p-[3px]"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <Link
                    href={sectionHref("boards")}
                    className="rounded-[9px] px-3.5 py-1.5 text-[12.5px] font-semibold"
                    style={{
                      background: active === "boards" ? "linear-gradient(155deg, var(--color-signal), var(--color-signal-deep))" : "transparent",
                      color: active === "boards" ? "#ffffff" : "#7e7d99",
                    }}
                  >
                    Доски
                  </Link>
                  <Link
                    href={boardHref}
                    className="rounded-[9px] px-3.5 py-1.5 text-[12.5px] font-semibold"
                    style={{
                      background: active === "board" ? "linear-gradient(155deg, var(--color-signal), var(--color-signal-deep))" : "transparent",
                      color: active === "board" ? "#ffffff" : "#7e7d99",
                    }}
                  >
                    Доска
                  </Link>
                </div>
              )}
            </div>
          )}
        </div>

        {children}
      </main>

      <ChangePasswordDialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen} />
      <TelegramLinkDialog open={telegramOpen} onOpenChange={setTelegramOpen} />
    </div>
  );
}
