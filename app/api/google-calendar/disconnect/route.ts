import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { disconnectGoogleCalendar } from "@/lib/google-calendar";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  await disconnectGoogleCalendar(user.email);
  return NextResponse.json({ ok: true });
}
