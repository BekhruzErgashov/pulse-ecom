import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-(--radius-control) bg-[var(--color-line)]/60", className)}
      {...props}
    />
  );
}

export { Skeleton };
