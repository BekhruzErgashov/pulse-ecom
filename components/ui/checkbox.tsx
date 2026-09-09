import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, ...props }, ref) => {
    return (
      <label className={cn("relative inline-flex size-4 shrink-0 cursor-pointer items-center justify-center", className)}>
        <input type="checkbox" ref={ref} checked={checked} className="peer sr-only" {...props} />
        <span
          className={cn(
            "flex size-4 items-center justify-center rounded border border-[var(--color-line)] bg-[var(--color-paper-raised)] transition-colors",
            "peer-checked:border-[var(--color-signal)] peer-checked:bg-[var(--color-signal)]",
            "peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--color-signal)] peer-focus-visible:ring-offset-1",
          )}
        >
          {checked && <Check className="size-3 text-white" strokeWidth={3} />}
        </span>
      </label>
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
