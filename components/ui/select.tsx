import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          className={cn(
            "flex h-9 w-full appearance-none rounded-(--radius-control) border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-3 py-1 pr-8 text-sm text-[var(--color-ink)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-signal)] disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--color-ink-soft)]" />
      </div>
    );
  },
);
Select.displayName = "Select";

export { Select };
