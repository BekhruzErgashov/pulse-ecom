import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-control) text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-signal)]",
  {
    variants: {
      variant: {
        default: "bg-[var(--color-signal)] text-[var(--color-on-accent)] hover:bg-[var(--color-signal-ink)]",
        outline:
          "border border-[var(--color-line)] bg-[var(--color-paper-raised)] text-[var(--color-ink)] hover:bg-[var(--color-paper)]",
        ghost: "text-[var(--color-ink)] hover:bg-[var(--color-paper)]",
        destructive: "bg-[var(--color-danger)] text-[var(--color-on-accent)] hover:opacity-90",
        subtle: "bg-[var(--color-signal-soft)] text-[var(--color-signal-ink)] hover:opacity-90",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-(--radius-control) px-3 text-xs",
        lg: "h-10 rounded-(--radius-control) px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, children, ...props }, ref) => {
    if (asChild && React.isValidElement(children)) {
      const child = children as React.ReactElement<{ className?: string }>;
      return React.cloneElement(child, {
        className: cn(buttonVariants({ variant, size }), child.props.className),
        ...props,
      });
    }
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
