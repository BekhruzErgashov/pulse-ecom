import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPasswordResetToken, getTelegramLinkByEmail, getUserByEmail } from "@/lib/data";
import { appUrl, escapeHtml, sendMessage } from "@/lib/telegram";

const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

/**
 * Самостоятельный сброс пароля через Telegram: если у указанного email есть
 * привязанный бот, туда уходит одноразовая ссылка (действует 30 минут). Ответ
 * одинаковый независимо от того, существует ли аккаунт и привязан ли бот —
 * чтобы не палить, какие email зарегистрированы. Если бот не привязан,
 * пользователю остаётся обратиться к администратору (как и раньше).
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Введите корректный email" }, { status: 400 });
  }

  const user = await getUserByEmail(parsed.data.email);
  if (user?.isActive) {
    const link = await getTelegramLinkByEmail(user.email);
    if (link) {
      const { token } = await createPasswordResetToken(user.email);
      const resetUrl = `${appUrl()}/reset-password?token=${token}`;
      await sendMessage(
        link.chatId,
        `🔑 Запрошен сброс пароля для аккаунта «Пульс».\n\nЕсли это были вы — перейдите по ссылке (действует 30 минут):\n${escapeHtml(resetUrl)}\n\nЕсли это не вы — просто проигнорируйте сообщение.`,
      );
    }
  }

  return NextResponse.json({ ok: true });
}
