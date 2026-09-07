import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { HandshakeListener } from "@/components/handshake-listener";
import { ThemeProvider } from "@/components/theme-provider";

const appName = "Пульс";

export const metadata: Metadata = {
  title: `${appName} — трекер задач для команды`,
  description:
    "Командные доски с визуализацией этапов выполнения и входом по email.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // suppressHydrationWarning — next-themes дописывает класс темы на <html>
    // до гидратации, и разметка сервера намеренно не совпадает с клиентом.
    <html lang="ru" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ThemeProvider>
          <HandshakeListener />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
