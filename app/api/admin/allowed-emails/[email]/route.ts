import { NextRequest, NextResponse } from "next/server";
import { removeAllowedEmail } from "@/lib/data";
import { requireAdmin } from "@/lib/session";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ email: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Только для администратора" }, { status: 403 });
  }
  const { email } = await params;
  await removeAllowedEmail(decodeURIComponent(email));
  return NextResponse.json({ ok: true });
}
