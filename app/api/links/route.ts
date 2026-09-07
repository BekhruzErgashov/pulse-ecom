import { NextRequest, NextResponse } from "next/server";
import { createWorkLinkSchema } from "@/lib/validation";
import { createWorkLink, listWorkLinks } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { canAccessWorkspace } from "@/lib/access";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return NextResponse.json({ error: "Не указано пространство" }, { status: 400 });
  }
  if (!(await canAccessWorkspace(user, workspaceId))) {
    return NextResponse.json({ error: "Нет доступа к этому пространству" }, { status: 403 });
  }
  const links = await listWorkLinks(workspaceId);
  return NextResponse.json({ links });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = createWorkLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (!(await canAccessWorkspace(user, parsed.data.workspaceId))) {
    return NextResponse.json({ error: "Нет доступа к этому пространству" }, { status: 403 });
  }

  const link = await createWorkLink({
    workspaceId: parsed.data.workspaceId,
    title: parsed.data.title,
    url: parsed.data.url,
    description: parsed.data.description,
    createdBy: user.email,
  });
  return NextResponse.json({ link }, { status: 201 });
}
