import { NextRequest, NextResponse } from "next/server";
import { submitGameScoreSchema } from "@/lib/validation";
import { listGameLeaderboard, listUsers, upsertGameScore } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { canAccessWorkspace } from "@/lib/access";
import type { GameId, LeaderboardEntry } from "@/lib/models";

function parseGameId(value: string | null): GameId | null {
  return value === "dino" || value === "samurai" || value === "doom" ? value : null;
}

/** Доска рекордов мини-игры в пространстве — топ-10, отсортирован по убыванию результата. */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  const gameId = parseGameId(request.nextUrl.searchParams.get("gameId"));
  if (!workspaceId || !gameId) {
    return NextResponse.json({ error: "Не указано пространство или игра" }, { status: 400 });
  }
  if (!(await canAccessWorkspace(user, workspaceId))) {
    return NextResponse.json({ error: "Нет доступа к этому пространству" }, { status: 403 });
  }

  const [scores, allUsers] = await Promise.all([
    listGameLeaderboard(workspaceId, gameId, 10),
    listUsers(),
  ]);
  const usersByEmail = new Map(allUsers.map((u) => [u.email, u]));

  const entries: LeaderboardEntry[] = scores.map((s) => {
    const u = usersByEmail.get(s.userEmail);
    return {
      userEmail: s.userEmail,
      name: u?.name ?? s.userEmail,
      color: u?.color ?? "#2451B3",
      score: s.score,
      updatedAt: s.updatedAt,
      isYou: s.userEmail === user.email,
    };
  });

  return NextResponse.json({ entries });
}

/** Отправка результата — сохраняется только если он выше уже сохранённого рекорда. */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = submitGameScoreSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (!(await canAccessWorkspace(user, parsed.data.workspaceId))) {
    return NextResponse.json({ error: "Нет доступа к этому пространству" }, { status: 403 });
  }

  const score = await upsertGameScore({
    workspaceId: parsed.data.workspaceId,
    gameId: parsed.data.gameId,
    userEmail: user.email,
    score: parsed.data.score,
  });
  return NextResponse.json({ score });
}
