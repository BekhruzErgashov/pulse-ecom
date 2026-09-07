import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { countUnreadNotifications, listNotifications, markAllNotificationsRead } from "@/lib/data";

/** Список последних уведомлений + счётчик непрочитанных — для колокольчика в шапке. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const [notifications, unread] = await Promise.all([
    listNotifications(user.email),
    countUnreadNotifications(user.email),
  ]);
  return NextResponse.json({ notifications, unread });
}

/** Отметить всё прочитанным — вызывается при открытии панели уведомлений. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  await markAllNotificationsRead(user.email);
  return NextResponse.json({ ok: true });
}
