import { NextRequest, NextResponse } from "next/server";
import { workspaceMemberSchema } from "@/lib/validation";
import { inviteWorkspaceMember, listPendingInvites, listWorkspaceMemberEmails } from "@/lib/data";
import { requireAdmin } from "@/lib/session";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Только для администратора" }, { status: 403 });
  }
  const { id } = await params;
  const [emails, pending] = await Promise.all([
    listWorkspaceMemberEmails(id),
    listPendingInvites(id),
  ]);
  return NextResponse.json({ emails, pending });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Только для администратора" }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = workspaceMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const status = await inviteWorkspaceMember(id, parsed.data.email.toLowerCase());
  return NextResponse.json({ ok: true, status }, { status: 201 });
}
