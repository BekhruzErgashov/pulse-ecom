import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import { getTelegramLinkByEmail, updateTelegramDigestHour, updateTelegramNotifyPref } from "@/lib/data";

const NOTIFY_PREF_KEYS = [
  "notifyTaskAssigned",
  "notifyComments",
  "notifyStageChanges",
  "notifyTaskDeleted",
  "notifyQuestions",
  "notifyDigest",
] as const;

const patchSchema = z.union([
  z.object({ key: z.enum(NOTIFY_PREF_KEYS), value: z.boolean() }),
  z.object({ digestHourUtc: z.number().int().min(0).max(23) }),
]);

/** Настройки уведомлений привязанного Telegram-аккаунта — какие события слать и в какой час сводку. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const link = await getTelegramLinkByEmail(user.email);
  if (!link) {
    return NextResponse.json({ error: "Telegram не привязан" }, { status: 404 });
  }
  return NextResponse.json({ link });
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const link =
    "key" in parsed.data
      ? await updateTelegramNotifyPref(user.email, parsed.data.key, parsed.data.value)
      : await updateTelegramDigestHour(user.email, parsed.data.digestHourUtc);

  if (!link) {
    return NextResponse.json({ error: "Telegram не привязан" }, { status: 404 });
  }
  return NextResponse.json({ link });
}
