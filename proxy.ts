import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE_NAME = "ttt_session";

export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE_NAME);
  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/boards/:path*",
    "/admin/:path*",
    "/questions/:path*",
    "/w/:path*",
    "/notes/:path*",
    "/game/:path*",
  ],
};
