import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumePasswordResetToken, resetUserPassword } from "@/lib/data";

const resetSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8, "Минимум 8 символов").max(200),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = resetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Некорректные данные" },
      { status: 400 },
    );
  }

  const email = await consumePasswordResetToken(parsed.data.token);
  if (!email) {
    return NextResponse.json(
      { error: "Ссылка недействительна или устарела — запросите новую" },
      { status: 400 },
    );
  }

  const ok = await resetUserPassword(email, parsed.data.password);
  if (!ok) {
    return NextResponse.json({ error: "Не удалось сбросить пароль" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
