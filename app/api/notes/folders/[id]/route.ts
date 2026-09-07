import { NextRequest, NextResponse } from "next/server";
import { deleteNoteFolder } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  await deleteNoteFolder(user.email, id);
  return NextResponse.json({ ok: true });
}
