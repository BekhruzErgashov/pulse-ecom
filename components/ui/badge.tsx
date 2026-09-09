import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "bg-[var(--color-signal-soft)] text-[var(--color-signal-ink)]",
        outline: "border border-[var(--color-line)] bg-[var(--color-paper)] text-[var(--color-ink-soft)]",
        todo: "bg-[var(--color-stage-todo-soft)] text-[var(--color-stage-todo)]",
        in_progress: "bg-[var(--color-stage-progress-soft)] text-[var(--color-stage-progress)]",
        review: "bg-[var(--color-stage-review-soft)] text-[var(--color-stage-review)]",
        done: "bg-[var(--color-stage-done-soft)] text-[var(--color-stage-done)]",
        danger: "bg-[var(--color-danger-soft)] text-[var(--color-danger)]",
        urgent: "bg-[var(--color-urgent)] text-white",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
