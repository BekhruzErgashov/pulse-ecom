import { NextRequest, NextResponse } from "next/server";
import { resetPasswordSchema } from "@/lib/validation";
import { getUserByEmail, resetUserPassword } from "@/lib/data";
import { requireAdmin } from "@/lib/session";
import { generateTemporaryPassword } from "@/lib/password";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ email: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Только для администратора" }, { status: 403 });
  }
  const { email } = await params;
  const targetEmail = decodeURIComponent(email);

  const target = await getUserByEmail(targetEmail);
  if (!target) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = resetPasswordSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const newPassword = parsed.data.password ?? generateTemporaryPassword();
  await resetUserPassword(targetEmail, newPassword);

  return NextResponse.json({ password: newPassword });
}
