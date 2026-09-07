import "server-only";
import { getGoogleCalendarLink, setGoogleCalendarLink, deleteGoogleCalendarLink } from "@/lib/data";
import type { GoogleCalendarEvent } from "@/lib/models";

/**
 * OAuth-клиент создаётся один раз в Google Cloud Console (см. HANDOFF.md,
 * раздел «Google Calendar» — там пошаговая инструкция) и даёт
 * GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET. Без них виджет календаря просто не
 * показывает кнопку подключения (см. isGoogleCalendarConfigured).
 */
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

/** Только чтение — приложению не нужно ничего менять в календаре пользователя. */
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

function appUrl(): string {
  return (
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

/** Redirect URI должен быть добавлен в Google Cloud Console → Credentials → тот же OAuth-клиент. */
export function googleCalendarRedirectUri(): string {
  return `${appUrl()}/api/google-calendar/callback`;
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(CLIENT_ID && CLIENT_SECRET);
}

/** Кука с CSRF-токеном OAuth-флоу — общая константа для connect/callback роутов. */
export const GOOGLE_OAUTH_STATE_COOKIE = "gcal_oauth_state";

/** Ссылка на экран согласия Google. `state` — случайная строка для защиты от CSRF, сверяется в callback с cookie. */
export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: googleCalendarRedirectUri(),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    // prompt=consent — иначе при повторном подключении Google не пришлёт
    // refresh_token заново (он выдаётся только на первом согласии).
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

async function callTokenEndpoint(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || data.error) {
    throw new Error(data.error_description || data.error || `Google token endpoint: ${res.status}`);
  }
  return data;
}

/** Обменивает код авторизации (из callback) на первую пару токенов и сохраняет привязку. */
export async function connectGoogleCalendar(email: string, code: string): Promise<void> {
  const data = await callTokenEndpoint({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: googleCalendarRedirectUri(),
    grant_type: "authorization_code",
  });
  if (!data.refresh_token) {
    // Не должно случаться при prompt=consent, но на всякий случай явно
    // говорим, что без refresh_token привязка бесполезна (протухнет через час).
    throw new Error("Google не выдал refresh_token — попробуйте отключить и подключить календарь заново");
  }
  await setGoogleCalendarLink(email, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiryDate: Date.now() + data.expires_in * 1000,
  });
}

/** Возвращает действующий access_token, обновляя его через refresh_token при необходимости. */
async function getFreshAccessToken(email: string): Promise<string | undefined> {
  const link = await getGoogleCalendarLink(email);
  if (!link) return undefined;

  // Небольшой запас (60с), чтобы не словить протухший токен из-за гонки.
  if (link.expiryDate - 60_000 > Date.now()) return link.accessToken;

  const data = await callTokenEndpoint({
    refresh_token: link.refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: "refresh_token",
  });
  await setGoogleCalendarLink(email, {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? link.refreshToken,
    expiryDate: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
}

interface GoogleEventItem {
  id: string;
  summary?: string;
  htmlLink: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

export type CalendarTodayResult =
  | { connected: false }
  | { connected: true; needsReconnect: true }
  | { connected: true; needsReconnect: false; events: GoogleCalendarEvent[] };

/** Встречи на сегодня (по календарю "primary" пользователя). Границы дня — по локальному времени сервера, как и остальные даты в приложении (см. lib/task-sort.ts). */
export async function getTodayEventsForUser(email: string): Promise<CalendarTodayResult> {
  const link = await getGoogleCalendarLink(email);
  if (!link) return { connected: false };

  let accessToken: string | undefined;
  try {
    accessToken = await getFreshAccessToken(email);
  } catch (err) {
    console.warn("[google-calendar] refresh failed:", err);
    // invalid_grant и т.п. — обычно значит, что пользователь отозвал доступ
    // в своём Google-аккаунте; просим переподключиться, а не падаем молча.
    await deleteGoogleCalendarLink(email);
    return { connected: true, needsReconnect: true };
  }
  if (!accessToken) return { connected: false };

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const params = new URLSearchParams({
    timeMin: startOfDay.toISOString(),
    timeMax: endOfDay.toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "20",
  });

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (res.status === 401) {
    // Токен отозван на стороне Google уже после обновления — тоже просим
    // переподключиться, вместо того чтобы бесконечно отдавать пустой список.
    await deleteGoogleCalendarLink(email);
    return { connected: true, needsReconnect: true };
  }
  if (!res.ok) {
    console.warn("[google-calendar] events fetch failed:", res.status, await res.text().catch(() => ""));
    return { connected: true, needsReconnect: false, events: [] };
  }

  const data = (await res.json().catch(() => ({ items: [] }))) as { items?: GoogleEventItem[] };
  const events: GoogleCalendarEvent[] = (data.items ?? []).map((item) => ({
    id: item.id,
    title: item.summary || "(без названия)",
    start: item.start?.dateTime ?? item.start?.date ?? "",
    end: item.end?.dateTime ?? item.end?.date ?? "",
    allDay: Boolean(item.start?.date && !item.start?.dateTime),
    htmlLink: item.htmlLink,
  }));

  return { connected: true, needsReconnect: false, events };
}

export async function isGoogleCalendarConnected(email: string): Promise<boolean> {
  const link = await getGoogleCalendarLink(email);
  return Boolean(link);
}

export async function disconnectGoogleCalendar(email: string): Promise<void> {
  await deleteGoogleCalendarLink(email);
}
