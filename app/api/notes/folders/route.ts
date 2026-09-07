import { NextRequest, NextResponse } from "next/server";
import { createNoteFolderSchema } from "@/lib/validation";
import { createNoteFolder, listNoteFolders } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const folders = await listNoteFolders(user.email);
  return NextResponse.json({ folders });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = createNoteFolderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const folder = await createNoteFolder({ ownerEmail: user.email, name: parsed.data.name });
  return NextResponse.json({ folder }, { status: 201 });
}
