"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  // Sonner красит success/error своими внутренними переменными и знает
  // только "light"/"dark" — наше "dark-glass" для него невалидно и молча
  // откатывается на светлый набор (чёрный текст в тёмной теме).
  const sonnerTheme = resolvedTheme === "dark-glass" ? "dark" : "light";

  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      theme={sonnerTheme}
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
