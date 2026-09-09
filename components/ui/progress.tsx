import * as React from "react";
import { cn } from "@/lib/utils";

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  colorVar?: string;
}

function Progress({ value, colorVar = "var(--color-signal)", className, ...props }: ProgressProps) {
  const clamped = Math.min(100, Math.max(0, value));
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-line)]", className)}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      {...props}
    >
      <div
        // background (не backgroundColor) — так colorVar может быть и
        // обычным цветом, и CSS-градиентом (`linear-gradient(...)`),
        // нужно для чек-листа в тёмной теме Task View, где по макету
        // заливка прогресс-бара — двухцветный градиент, а не плоский цвет.
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${clamped}%`, background: colorVar }}
      />
    </div>
  );
}

export { Progress };
