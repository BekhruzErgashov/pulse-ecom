import { NextRequest, NextResponse } from "next/server";
import { listMyTasksInWorkspace } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { canAccessWorkspace } from "@/lib/access";
import { collectDoneWeeks, filterDoneTasksByWeek, getCurrentWeekKey } from "@/lib/week";

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
  const allTasks = await listMyTasksInWorkspace(workspaceId, user.email);

  const doneWeek = request.nextUrl.searchParams.get("doneWeek") || getCurrentWeekKey();
  const doneWeeks = collectDoneWeeks(allTasks);
  const tasks = filterDoneTasksByWeek(allTasks, doneWeek);

  return NextResponse.json({ tasks, doneWeek, doneWeeks });
}
