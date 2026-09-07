import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { markNotificationRead } from "@/lib/data";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  await markNotificationRead(id, user.email);
  return NextResponse.json({ ok: true });
}
