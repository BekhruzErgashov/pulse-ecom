"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { TelegramLink, TelegramNotifyPrefKey } from "@/lib/models";

const NOTIFY_PREFS: { key: TelegramNotifyPrefKey; label: string }[] = [
  { key: "notifyTaskAssigned", label: "Назначение задач" },
  { key: "notifyComments", label: "Комментарии к задачам" },
  { key: "notifyStageChanges", label: "Смена этапа задачи" },
  { key: "notifyTaskDeleted", label: "Удаление задачи" },
  { key: "notifyQuestions", label: "Вопросы" },
  { key: "notifyDigest", label: "Ежедневная сводка" },
];

function PrefToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 py-2">
      <span className="text-sm text-[var(--color-ink)]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 shrink-0 rounded-full transition-colors",
          checked ? "bg-[var(--color-signal)]" : "bg-[var(--color-line)]",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 size-4 rounded-full bg-white transition-transform",
            checked && "translate-x-4",
          )}
        />
      </button>
    </label>
  );
}

export function TelegramLinkDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = React.useState(true);
  const [linked, setLinked] = React.useState(false);
  const [deepLink, setDeepLink] = React.useState<string | undefined>();
  const [pending, setPending] = React.useState(false);
  const [prefs, setPrefs] = React.useState<TelegramLink | null>(null);
  const [prefsLoading, setPrefsLoading] = React.useState(false);

  const [botUsername, setBotUsername] = React.useState("");

  React.useEffect(() => {
    if (!open) return;
    setDeepLink(undefined);
    setLoading(true);
    fetch("/api/telegram/link")
      .then((res) => (res.ok ? res.json() : { linked: false }))
      .then((data) => {
        setLinked(Boolean(data.linked));
        setBotUsername(typeof data.botUsername === "string" ? data.botUsername : "");
      })
      .finally(() => setLoading(false));
  }, [open]);

  React.useEffect(() => {
    if (!open || !linked) {
      setPrefs(null);
      return;
    }
    setPrefsLoading(true);
    fetch("/api/telegram/prefs")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setPrefs(data?.link ?? null))
      .finally(() => setPrefsLoading(false));
  }, [open, linked]);

  async function handleTogglePref(key: TelegramNotifyPrefKey, value: boolean) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    try {
      const res = await fetch("/api/telegram/prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) {
        setPrefs(previous);
        toast.error("Не удалось сохранить настройку");
        return;
      }
      const data = await res.json();
      setPrefs(data.link);
    } catch {
      setPrefs(previous);
      toast.error("Не удалось сохранить настройку");
    }
  }

  async function handleDigestHourChange(hour: number) {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, digestHourUtc: hour });
    try {
      const res = await fetch("/api/telegram/prefs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ digestHourUtc: hour }),
      });
      if (!res.ok) {
        setPrefs(previous);
        toast.error("Не удалось сохранить час сводки");
        return;
      }
      const data = await res.json();
      setPrefs(data.link);
    } catch {
      setPrefs(previous);
      toast.error("Не удалось сохранить час сводки");
    }
  }

  async function handleGetLink() {
    setPending(true);
    try {
      const res = await fetch("/api/telegram/link", { method: "POST" });
      if (!res.ok) {
        toast.error("Не удалось создать ссылку для привязки");
        return;
      }
      const data = await res.json();
      setDeepLink(data.deepLink);
    } finally {
      setPending(false);
    }
  }

  async function handleUnlink() {
    setPending(true);
    try {
      const res = await fetch("/api/telegram/link", { method: "DELETE" });
      if (!res.ok) {
        toast.error("Не удалось отключить Telegram");
        return;
      }
      setLinked(false);
      setDeepLink(undefined);
      toast.success("Telegram отключён");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Telegram-бот</DialogTitle>
          <DialogDescription>
            Уведомления о новых задачах, вопросах и напоминания о сроках — прямо в Telegram.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8 text-[var(--color-ink-soft)]">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : linked ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[var(--color-ink-soft)]">
              Ваш аккаунт подключён к боту. Вы получаете уведомления о назначенных задачах,
              вопросах и ежедневную сводку по срокам.
            </p>
            {prefs?.username && (
              <p className="text-sm font-medium text-[var(--color-ink)]">
                Привязано как @{prefs.username}
              </p>
            )}
            {prefsLoading ? (
              <div className="flex items-center justify-center py-4 text-[var(--color-ink-soft)]">
                <Loader2 className="size-4 animate-spin" />
              </div>
            ) : (
              prefs && (
                <>
                  <div className="flex flex-col divide-y divide-[var(--color-line)]">
                    {NOTIFY_PREFS.map(({ key, label }) => (
                      <PrefToggle
                        key={key}
                        label={label}
                        checked={prefs[key]}
                        onChange={(value) => handleTogglePref(key, value)}
                      />
                    ))}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="digest-hour">Час сводки (UTC)</Label>
                    <select
                      id="digest-hour"
                      value={prefs.digestHourUtc}
                      onChange={(e) => handleDigestHourChange(Number(e.target.value))}
                      className="h-9 w-full rounded-(--radius-control) border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-3 text-sm text-[var(--color-ink)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-signal)]"
                    >
                      {Array.from({ length: 24 }, (_, hour) => (
                        <option key={hour} value={hour}>
                          {hour}:00
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-[var(--color-ink-soft)]">
                      Например, 4 UTC ≈ 09:00 в Ташкенте (UTC+5).
                    </p>
                  </div>
                </>
              )
            )}
          </div>
        ) : deepLink ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--color-ink-soft)]">
              Откройте ссылку и нажмите «Start» в чате с ботом — привязка завершится
              автоматически. Ссылка одноразовая и действует 15 минут.
            </p>
            <a
              href={deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-(--radius-control) border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-4 py-2.5 text-sm font-medium text-[var(--color-signal-ink)] transition-colors hover:border-[var(--color-signal)]"
            >
              <Send className="size-4" /> Открыть бота в Telegram
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-[var(--color-ink-soft)]">
              Нажмите кнопку, чтобы получить персональную ссылку для привязки аккаунта к боту
              {botUsername ? ` @${botUsername}` : ""}.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
          {!loading &&
            (linked ? (
              <Button type="button" variant="destructive" onClick={handleUnlink} disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                Отключить
              </Button>
            ) : (
              <Button type="button" onClick={handleGetLink} disabled={pending}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                {deepLink ? "Обновить ссылку" : "Получить ссылку"}
              </Button>
            ))}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
