import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { getUserByEmail } from "@/lib/data";
import type { User } from "@/lib/models";

const COOKIE_NAME = "ttt_session";

/**
 * SESSION_SECRET должен быть задан в проде (переменная окружения) —
 * без него сессии подписываются предсказуемым dev-ключом, и куки
 * теоретически можно подделать. Задайте случайную строку в .env.local
 * и в настройках хостинга: SESSION_SECRET=любая-длинная-случайная-строка
 */
const SECRET = process.env.SESSION_SECRET || "dev-only-insecure-secret-change-me";

export interface Session {
  email: string;
}

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function encodeSession(session: Session): string {
  const payload = Buffer.from(JSON.stringify(session), "utf-8").toString("base64url");
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function decodeSession(value: string): Session | null {
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = sign(payload);
  const a = Buffer.from(signature, "utf-8");
  const b = Buffer.from(expected, "utf-8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    if (typeof parsed?.email === "string") return { email: parsed.email };
    return null;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const session = decodeSession(raw);
  if (!session) return null;
  const user = await getUserByEmail(session.email);
  if (!user || !user.isActive) return null;
  return user;
}

export async function requireAdmin(): Promise<User | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") return null;
  return user;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
