import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getTodayEventsForUser } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

/** Используется виджетом для кнопки «Обновить» — без перезагрузки страницы. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const result = await getTodayEventsForUser(user.email);
  return NextResponse.json(result);
}
