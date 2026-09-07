import { NextRequest, NextResponse } from "next/server";
import { createNoteSchema } from "@/lib/validation";
import { createNote, listNotes } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const notes = await listNotes(user.email);
  return NextResponse.json({ notes });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const body = await request.json().catch(() => ({}));
  const parsed = createNoteSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const note = await createNote({
    ownerEmail: user.email,
    title: parsed.data.title ?? "",
    body: parsed.data.body ?? "",
    folderId: parsed.data.folderId ?? null,
  });
  return NextResponse.json({ note }, { status: 201 });
}
