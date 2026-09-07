import { NextRequest, NextResponse } from "next/server";
import { updateNoteSchema } from "@/lib/validation";
import { deleteNote, getNote, updateNote } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const note = await getNote(user.email, id);
  if (!note) {
    return NextResponse.json({ error: "Заметка не найдена" }, { status: 404 });
  }
  return NextResponse.json({ note });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateNoteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const note = await updateNote(user.email, id, parsed.data);
  if (!note) {
    return NextResponse.json({ error: "Заметка не найдена" }, { status: 404 });
  }
  return NextResponse.json({ note });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  await deleteNote(user.email, id);
  return NextResponse.json({ ok: true });
}
