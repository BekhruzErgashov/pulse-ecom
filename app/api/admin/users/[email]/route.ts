import { NextRequest, NextResponse } from "next/server";
import { updateUserSchema } from "@/lib/validation";
import { countAdmins, deleteUser, getUserByEmail, updateUser } from "@/lib/data";
import { requireAdmin } from "@/lib/session";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ email: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Только для администратора" }, { status: 403 });
  }
  const { email } = await params;
  const targetEmail = decodeURIComponent(email);

  const body = await request.json().catch(() => null);
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const target = await getUserByEmail(targetEmail);
  if (!target) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  const demotingOrDeactivatingAdmin =
    target.role === "admin" &&
    ((parsed.data.role && parsed.data.role !== "admin") || parsed.data.isActive === false);

  if (demotingOrDeactivatingAdmin) {
    const admins = await countAdmins();
    if (admins <= 1) {
      return NextResponse.json(
        { error: "Нельзя убрать последнего администратора" },
        { status: 400 },
      );
    }
  }

  const updated = await updateUser(targetEmail, parsed.data);
  return NextResponse.json({ user: updated });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ email: string }> },
) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Только для администратора" }, { status: 403 });
  }
  const { email } = await params;
  const targetEmail = decodeURIComponent(email);

  if (targetEmail === admin.email) {
    return NextResponse.json({ error: "Нельзя удалить собственный аккаунт" }, { status: 400 });
  }

  const target = await getUserByEmail(targetEmail);
  if (!target) {
    return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  }

  if (target.role === "admin") {
    const admins = await countAdmins();
    if (admins <= 1) {
      return NextResponse.json(
        { error: "Нельзя удалить последнего администратора" },
        { status: 400 },
      );
    }
  }

  const result = await deleteUser(targetEmail);
  if ("error" in result) {
    const messages: Record<string, string> = {
      owns_workspaces:
        "У этого пользователя есть созданные пространства. Сначала передайте их другому владельцу или удалите.",
      owns_boards:
        "У этого пользователя есть доски, где он владелец. Сначала передайте владение или удалите доски.",
      not_found: "Пользователь не найден",
    };
    return NextResponse.json({ error: messages[result.error] }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
