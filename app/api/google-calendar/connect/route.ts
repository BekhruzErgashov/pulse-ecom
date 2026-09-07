import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getCurrentUser } from "@/lib/session";
import {
  GOOGLE_OAUTH_STATE_COOKIE,
  buildAuthorizeUrl,
  isGoogleCalendarConfigured,
} from "@/lib/google-calendar";

/**
 * Запускает OAuth-привязку личного Google-календаря. Обычная навигация
 * (не fetch) — виджет ссылкой уводит сюда, отсюда редирект на экран
 * согласия Google, а он потом вернёт пользователя в /api/google-calendar/callback.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const workspaceId = request.nextUrl.searchParams.get("workspaceId") || "";

  if (!isGoogleCalendarConfigured()) {
    const url = new URL(`/w/${workspaceId}/boards`, request.url);
    url.searchParams.set("calendar_error", "not_configured");
    return NextResponse.redirect(url);
  }

  // Случайный токен — защита от CSRF; кладём в state вместе с workspaceId
  // (чтобы после согласия вернуть пользователя на ту же доску), а сам токен
  // отдельно сверяем с httpOnly-кукой в callback.
  const token = randomBytes(16).toString("hex");
  const state = `${token}:${workspaceId}`;

  const response = NextResponse.redirect(buildAuthorizeUrl(state));
  response.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return response;
}
