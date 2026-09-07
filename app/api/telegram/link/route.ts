import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import {
  createTelegramLinkToken,
  deleteTelegramLink,
  getTelegramLinkByEmail,
} from "@/lib/data";

const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || "diytask_tracker_bot";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const link = await getTelegramLinkByEmail(user.email);
  // botUsername отдаём клиенту, чтобы диалог привязки не хранил имя бота
  // у себя в разметке — оно задаётся одной переменной окружения.
  return NextResponse.json({
    linked: Boolean(link),
    linkedAt: link?.linkedAt ?? null,
    botUsername: BOT_USERNAME,
  });
}

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { token } = await createTelegramLinkToken(user.email);
  const deepLink = `https://t.me/${BOT_USERNAME}?start=${token}`;
  return NextResponse.json({ deepLink });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  await deleteTelegramLink(user.email);
  return NextResponse.json({ ok: true });
}
