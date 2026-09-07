import * as React from "react";
import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          "flex h-9 w-full rounded-(--radius-control) border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-3 py-1 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-soft)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-signal)] disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
