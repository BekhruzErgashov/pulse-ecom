"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface DropdownContextValue {
  open: boolean;
  setOpen: (v: boolean) => void;
}
const DropdownContext = React.createContext<DropdownContextValue | null>(null);

function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <DropdownContext.Provider value={{ open, setOpen }}>
      <div ref={ref} className="relative inline-block">
        {children}
      </div>
    </DropdownContext.Provider>
  );
}

function DropdownMenuTrigger({
  children,
  asChild: _asChild,
}: {
  children: React.ReactElement<{ onClick?: React.MouseEventHandler }>;
  asChild?: boolean;
}) {
  const ctx = React.useContext(DropdownContext)!;
  return React.cloneElement(children, {
    onClick: (e: React.MouseEvent) => {
      children.props.onClick?.(e);
      ctx.setOpen(!ctx.open);
    },
  });
}

function DropdownMenuContent({ className, children, align = "end" }: { className?: string; children: React.ReactNode; align?: "start" | "end" }) {
  const ctx = React.useContext(DropdownContext)!;
  if (!ctx.open) return null;
  return (
    <div
      className={cn(
        "panel absolute z-40 mt-2 min-w-[10rem] animate-in fade-in slide-in-from-top-1 duration-150 p-1 shadow-md",
        align === "end" ? "right-0" : "left-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

function DropdownMenuItem({
  className,
  onClick,
  children,
  variant,
}: {
  className?: string;
  onClick?: () => void;
  children: React.ReactNode;
  variant?: "destructive";
}) {
  const ctx = React.useContext(DropdownContext)!;
  return (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        ctx.setOpen(false);
      }}
      className={cn(
        "flex w-full items-center gap-2 rounded-(--radius-control) px-2 py-1.5 text-left text-sm hover:bg-[var(--color-paper)]",
        variant === "destructive" && "text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem };
