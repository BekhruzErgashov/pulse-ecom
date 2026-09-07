"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";

/**
 * Тема хранится в localStorage и ставится классом `dark` на <html> ещё до
 * гидратации (скрипт next-themes) — поэтому при перезагрузке нет вспышки
 * светлого фона. Значение по умолчанию — системная тема.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="pulse-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
