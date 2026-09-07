import { NextRequest, NextResponse, after } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { listWorkspaceMemberEmails } from "@/lib/data";
import { escapeHtml } from "@/lib/telegram";
import { notify } from "@/lib/notifications";

const broadcastSchema = z.object({
  workspaceId: z.string().min(1),
  message: z.string().trim().min(1, "Введите текст сообщения").max(2000),
});

/**
 * Админ-рассылка: сообщение уходит всем участникам пространства — и в
 * колокольчик внутри приложения (всем), и в Telegram (тем, у кого бот
 * привязан). Полезно для команды объявлений без отдельного канала связи.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Требуется доступ администратора" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const parsed = broadcastSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const members = await listWorkspaceMemberEmails(parsed.data.workspaceId);
  const recipients = members.filter((email) => email !== admin.email);

  for (const email of recipients) {
    after(() =>
      notify({
        userEmail: email,
        type: "broadcast",
        title: `Объявление от ${admin.name}`,
        body: parsed.data.message,
        telegramText: `📢 <b>Объявление от ${escapeHtml(admin.name)}</b>\n\n${escapeHtml(parsed.data.message)}`,
      }),
    );
  }

  return NextResponse.json({ ok: true, sent: recipients.length });
}
