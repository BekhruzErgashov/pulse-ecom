import { NextResponse } from "next/server";
import { listWorkspaces } from "@/lib/data";
import { requireAdmin } from "@/lib/session";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Только для администратора" }, { status: 403 });
  }
  const workspaces = await listWorkspaces();
  return NextResponse.json({ workspaces });
}
