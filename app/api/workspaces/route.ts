import { NextRequest, NextResponse } from "next/server";
import { createWorkspaceSchema } from "@/lib/validation";
import { createWorkspace, listWorkspaces, listWorkspacesForUser } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const workspaces =
    user.role === "admin" ? await listWorkspaces() : await listWorkspacesForUser(user.email);
  return NextResponse.json({ workspaces });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Создавать пространства может только администратор" },
      { status: 403 },
    );
  }
  const body = await request.json().catch(() => null);
  const parsed = createWorkspaceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const workspace = await createWorkspace({ name: parsed.data.name, createdBy: user.email });
  return NextResponse.json({ workspace }, { status: 201 });
}
