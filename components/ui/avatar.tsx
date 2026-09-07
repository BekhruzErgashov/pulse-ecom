import * as React from "react";
import { cn } from "@/lib/utils";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  color?: string;
  size?: "sm" | "md";
}

function Avatar({ name, color, size = "md", className, ...props }: AvatarProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-mono font-medium text-white",
        size === "sm" ? "size-6 text-[10px]" : "size-8 text-xs",
        className,
      )}
      style={{ backgroundColor: color ?? "var(--color-signal)" }}
      title={name}
      {...props}
    >
      {initials(name)}
    </div>
  );
}

export { Avatar };
