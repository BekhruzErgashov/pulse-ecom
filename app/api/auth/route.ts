import { NextRequest, NextResponse } from "next/server";
import { loginSchema } from "@/lib/validation";
import { verifyLogin } from "@/lib/data";
import { encodeSession, getCurrentUser, SESSION_COOKIE_NAME } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({ user });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const user = await verifyLogin(parsed.data.email, parsed.data.password);
  if (!user) {
    return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
  }

  const response = NextResponse.json({ user });
  response.cookies.set(SESSION_COOKIE_NAME, encodeSession({ email: user.email }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  return response;
}
