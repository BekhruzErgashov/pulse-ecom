"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DialogContextValue {
  onOpenChange: (open: boolean) => void;
}
const DialogContext = React.createContext<DialogContextValue | null>(null);

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}

function Dialog({ open, onOpenChange, children }: DialogProps) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onOpenChange]);

  if (!mounted || !open) return null;

  return createPortal(
    <DialogContext.Provider value={{ onOpenChange }}>
      <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 pt-16 sm:pt-24">
        <div
          // Затемняющая подложка модалки — намеренно чёрная, а не
          // var(--color-ink): тот токен задуман как «цвет текста», в
          // светлой теме он тёмный и подложка случайно работала как надо,
          // но в тёмной теме --color-ink почти белый — подложка светлела
          // бы вместо затемнения фона позади диалога. Чистый чёрный со
          // своей альфой работает одинаково в обеих темах. dialog-backdrop
          // — точка расширения для тёмной темы (globals.css): по макету
          // (Пульс - Экран задач.html) подложка там rgba(5,8,22,0.68) +
          // blur(10px), а не плоский чёрный — правило применяется ко ВСЕМ
          // диалогам в тёмной теме, консистентно с остальным «премиальным
          // стеклом» редизайна, не только к Task View.
          className="dialog-backdrop fixed inset-0 bg-black/50 animate-in fade-in duration-200"
          onClick={() => onOpenChange(false)}
        />
        {children}
      </div>
    </DialogContext.Provider>,
    document.body,
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  unstyled = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  /** По умолчанию true — обычный крестик в углу. false — когда экран сам
   *  рисует свой способ закрытия (например, пилюля «← Назад» в
   *  тёмной теме Task View, по референсу макета — там нет отдельного
   *  крестика вообще). */
  showCloseButton?: boolean;
  /** По умолчанию false — обычные `.panel` фон/паддинг/тень. true —
   *  только позиционирование и анимация выезда, без `.panel` и без
   *  собственного фона/паддинга/тени вообще. Нужно, когда экран сам
   *  собирает вид из нескольких стеклянных карточек-детей (Task View,
   *  тёмная тема, по макету — там ДВЕ отдельные стеклянные панели рядом,
   *  а не один общий короб на весь диалог) и общий `.panel`-фон на
   *  внешнем контейнере был бы лишним/мешал. */
  unstyled?: boolean;
}) {
  const ctx = React.useContext(DialogContext);
  return (
    <div
      role="dialog"
      aria-modal="true"
      className={cn(
        // ease-[cubic-bezier(...)] — лёгкая пружинная (back-out) кривая
        // вместо дефолтного линейного ease-in-out у tw-animate-css: по
        // правке «сделать дороже, но сдержаннее» — вместо того чтобы
        // добавлять анимации в новых местах, единственное движение,
        // которое явно видит пользователь при каждом открытии диалога
        // (включая Task View), получило чуть более «физическое» ощущение
        // — на 1-2% перелетает и мягко возвращается, а не линейно
        // подъезжает. Подложка (dialog-backdrop ниже) специально
        // остаётся на простом fade без пружины — весь «акцент» движения
        // держится на одном элементе, а не на каждом сразу.
        "relative z-10 w-full min-w-0 max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]",
        !unstyled && "panel p-6 shadow-lg",
        // unstyled сам по себе убирает только Tailwind-классы "panel p-6
        // shadow-lg" — но есть ещё общее CSS-правило
        // [data-theme="dark-glass"] [role="dialog"] (globals.css), которое
        // красит ЛЮБОЙ [role="dialog"] полупрозрачным фоном + своим
        // backdrop-filter, независимо от Tailwind-классов (это отдельный,
        // непривязанный к classList селектор по атрибуту). Для Task View
        // это означало ЛИШНИЙ третий слой backdrop-filter вокруг двух
        // .glass-panel карточек — просвечивал в 18px-зазоре между ними
        // серовато-popover-тоном и (что важнее) съедал часть браузерного
        // «бюджета» на одновременные backdrop-filter, из-за чего у самих
        // карточек blur мог не отрисоваться. Класс .unstyled-dialog ниже
        // явно обнуляет этот слой через более специфичное CSS-правило.
        unstyled && "unstyled-dialog",
        className,
      )}
      {...props}
    >
      {showCloseButton && (
        <button
          type="button"
          onClick={() => ctx?.onOpenChange(false)}
          className="absolute right-4 top-4 rounded-(--radius-control) p-1 text-[var(--color-ink-soft)] hover:bg-[var(--color-paper)]"
          aria-label="Закрыть"
        >
          <X className="size-4" />
        </button>
      )}
      {children}
    </div>
  );
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex flex-col gap-1", className)} {...props} />;
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-semibold", className)} {...props} />;
}

function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-[var(--color-ink-soft)]", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-5 flex justify-end gap-2", className)} {...props} />;
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter };
