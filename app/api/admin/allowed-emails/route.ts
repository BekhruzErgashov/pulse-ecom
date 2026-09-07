import { NextRequest, NextResponse } from "next/server";
import { addAllowedEmailSchema } from "@/lib/validation";
import { addAllowedEmail, listAllowedEmails } from "@/lib/data";
import { requireAdmin } from "@/lib/session";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Только для администратора" }, { status: 403 });
  }
  const emails = await listAllowedEmails();
  return NextResponse.json({ emails });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Только для администратора" }, { status: 403 });
  }
  const body = await request.json().catch(() => null);
  const parsed = addAllowedEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const entry = await addAllowedEmail(parsed.data.email, admin.email);
  return NextResponse.json({ entry }, { status: 201 });
}
