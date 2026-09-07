import { NextRequest, NextResponse } from "next/server";
import { registerSchema } from "@/lib/validation";
import { registerUser } from "@/lib/data";
import { encodeSession, SESSION_COOKIE_NAME } from "@/lib/session";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const result = await registerUser(parsed.data);
  if ("error" in result) {
    if (result.error === "not_allowed") {
      return NextResponse.json(
        { error: "Этот email не в списке разрешённых. Обратитесь к администратору." },
        { status: 403 },
      );
    }
    return NextResponse.json(
      { error: "Аккаунт с таким email уже существует. Войдите вместо регистрации." },
      { status: 409 },
    );
  }

  const response = NextResponse.json({ user: result.user }, { status: 201 });
  response.cookies.set(SESSION_COOKIE_NAME, encodeSession({ email: result.user.email }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
