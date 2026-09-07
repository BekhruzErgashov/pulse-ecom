import { NextRequest, NextResponse } from "next/server";
import { removePendingInvite } from "@/lib/data";
import { requireAdmin } from "@/lib/session";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; email: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Только для администратора" }, { status: 403 });
  }
  const { id, email } = await params;
  await removePendingInvite(id, decodeURIComponent(email));
  return NextResponse.json({ ok: true });
}
