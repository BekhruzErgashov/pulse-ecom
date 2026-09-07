"use client";

import * as React from "react";
import Link from "next/link";
import { Radio, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setPending(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setPending(false);
      setSent(true);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <div className="mb-8 flex items-center gap-2">
        <Radio className="size-4 text-[var(--color-signal)]" />
        <span className="eyebrow">Пульс</span>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Восстановление пароля</h1>
      <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
        Укажите email — если к аккаунту привязан Telegram-бот, туда придёт ссылка для сброса
        пароля.
      </p>
      {sent ? (
        <p className="mt-8 text-sm text-[var(--color-ink)]">
          Если аккаунт с этим email привязан к Telegram-боту, туда придёт ссылка для сброса
          пароля.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="anna@team.dev"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              required
            />
          </div>
          <Button type="submit" disabled={pending} className="mt-2">
            {pending && <Loader2 className="size-4 animate-spin" />}
            Отправить ссылку
          </Button>
        </form>
      )}
      <p className="mt-6 text-sm text-[var(--color-ink-soft)]">
        Вспомнили пароль?{" "}
        <Link href="/login" className="font-medium text-[var(--color-signal)] hover:underline">
          Войти
        </Link>
      </p>
    </main>
  );
}
