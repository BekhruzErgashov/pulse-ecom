import type { NextConfig } from "next";

const basePath =
  process.env.BASE_PATH !== undefined ? process.env.BASE_PATH : "";

const nextConfig: NextConfig = {
  output: process.env.OUTPUT_MODE === "export" ? "export" : undefined,

  ...(basePath && {
    basePath,
    assetPrefix: basePath,
  }),

  ...(process.env.OUTPUT_MODE === "export" && {
    images: {
      unoptimized: true,
    },
  }),
  allowedDevOrigins: ["*"],

  devIndicators: false,
  poweredByHeader: false,
  reactStrictMode: true,

  // headers() не поддерживается при статическом экспорте (OUTPUT_MODE=export) —
  // подключаем только для обычного серверного режима (прод на Vercel).
  ...(process.env.OUTPUT_MODE !== "export" && {
    async headers() {
      return [
        {
          // Спрайты игры — статичные PNG, не меняются между деплоями без
          // смены имени файла. Без явного long-cache браузер может
          // ревалидировать их при каждом заходе на страницу игры, что при
          // плохой сети даёт заметное мигание/пропажу кадров персонажа
          // или препятствий на повторных заездах.
          source: "/game/:path*",
          headers: [
            { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          ],
        },
      ];
    },
  }),
};

export default nextConfig;
