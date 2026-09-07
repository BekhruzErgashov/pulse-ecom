"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      theme={(resolvedTheme as ToasterProps["theme"]) ?? "system"}
      toastOptions={{
        style: {
          background: "var(--color-paper-raised)",
          color: "var(--color-ink)",
          border: "1px solid var(--color-line)",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
