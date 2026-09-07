import { NextRequest, NextResponse } from "next/server";
import { deleteWorkLink, getWorkLink } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { canAccessWorkspace } from "@/lib/access";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const link = await getWorkLink(id);
  if (!link) {
    return NextResponse.json({ error: "Ссылка не найдена" }, { status: 404 });
  }
  // Удалить может любой участник пространства — ссылки общие для команды,
  // как и сама вкладка «Ссылки».
  if (!(await canAccessWorkspace(user, link.workspaceId))) {
    return NextResponse.json({ error: "Нет доступа к этому пространству" }, { status: 403 });
  }
  await deleteWorkLink(id);
  return NextResponse.json({ ok: true });
}
