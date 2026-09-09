import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope, PT_Serif } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { HandshakeListener } from "@/components/handshake-listener";

const appName = "Пульс";

// Шрифты редизайна («Dark Liquid-Glass», см. HANDOFF.md) — используются
// только тёмной темой (dark-glass), через CSS-переменные --font-display/
// --font-label в globals.css, поэтому подключены глобально здесь (next/font
// сам не грузит ничего, пока переменная не использована), не задевая
// светлую тему ни байтом.
//
// PT Serif вместо Space Grotesk (правка «сделать дороже», типографика) —
// у Space Grotesk не было кириллицы вообще, только латиница, поэтому для
// заголовков на русском (подавляющее большинство контента в приложении)
// --font-display молча откатывался на второй шрифт в стеке (Manrope — тот
// же, что и у обычного текста), и «характерный дисплейный шрифт» из брифа
// физически не был виден почти нигде в интерфейсе. PT Serif — с полной
// поддержкой кириллицы (шрифт ParaType, изначально сделан именно под
// русскую типографику) и засечками — даёт настоящий контраст с гротескным
// Manrope в теле текста на ОБОИХ алфавитах, а не только на латинице.
// Доступны только начертания 400/700 (без «полужирного» 600) — компоненты,
// просящие font-semibold, получат ближайшее реально загруженное — 700,
// визуально это ок (почти все остальные места и так на font-bold).
const ptSerif = PT_Serif({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-pt-serif",
  display: "swap",
});
const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${appName} — трекер задач для команды`,
  description:
    "Командные доски с визуализацией этапов выполнения и входом по email.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ru"
      className={`${ptSerif.variable} ${manrope.variable} ${plexMono.variable}`}
    >
      <body className="min-h-screen antialiased">
        {/*
          Переключатель темы (team-header.tsx, пункт меню профиля рядом со
          «Сменить пароль») — тёмная «стеклянная» тема описана переменными
          в app/globals.css под [data-theme="dark-glass"]. enableSystem
          выключен: это не авто-переключение по системной теме
          устройства, а явный выбор пользователя. enableColorScheme тоже
          выключен — next-themes умеет проставлять нативный
          `color-scheme` только для тем, буквально названных "light"/"dark",
          а не для нашего "dark-glass"; сам color-scheme:dark для тёмной
          темы уже выставлен в globals.css через CSS-селектор.
        */}
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="light"
          themes={["light", "dark-glass"]}
          enableSystem={false}
          enableColorScheme={false}
          storageKey="ttt_theme"
        >
          <HandshakeListener />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
