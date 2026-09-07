import { NextRequest, NextResponse } from "next/server";
import { changePasswordSchema } from "@/lib/validation";
import { changeOwnPassword } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const ok = await changeOwnPassword(
    user.email,
    parsed.data.currentPassword,
    parsed.data.newPassword,
  );
  if (!ok) {
    return NextResponse.json({ error: "Текущий пароль указан неверно" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
