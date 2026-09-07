import { NextResponse } from "next/server";
import { listUsers } from "@/lib/data";
import { requireAdmin } from "@/lib/session";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Только для администратора" }, { status: 403 });
  }
  const users = await listUsers();
  return NextResponse.json({ users });
}
