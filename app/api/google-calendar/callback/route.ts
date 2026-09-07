import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { GOOGLE_OAUTH_STATE_COOKIE, connectGoogleCalendar } from "@/lib/google-calendar";

/** Google возвращает пользователя сюда после экрана согласия. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const state = params.get("state") || "";
  const [token, workspaceId] = state.split(":");

  const boardsUrl = new URL(`/w/${workspaceId || ""}/boards`, request.url);
  const cookieToken = request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;

  function redirectWithError(error: string): NextResponse {
    boardsUrl.searchParams.set("calendar_error", error);
    const res = NextResponse.redirect(boardsUrl);
    res.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
    return res;
  }

  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  if (!cookieToken || cookieToken !== token) {
    return redirectWithError("state");
  }
  if (params.get("error")) {
    // Пользователь нажал «Отмена» на экране согласия Google.
    return redirectWithError("denied");
  }
  if (!code) {
    return redirectWithError("denied");
  }

  try {
    await connectGoogleCalendar(user.email, code);
  } catch (err) {
    console.error("[google-calendar] connect failed:", err);
    return redirectWithError("failed");
  }

  boardsUrl.searchParams.set("calendar", "connected");
  const res = NextResponse.redirect(boardsUrl);
  res.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  return res;
}
