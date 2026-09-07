"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Radio, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const [done, setDone] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setError("Ссылка недействительна — токен отсутствует");
      return;
    }
    if (password.length < 8) {
      setError("Минимум 8 символов");
      return;
    }
    if (password !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }
    setError(undefined);
    setPending(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const message = data?.error ?? "Не удалось сбросить пароль";
        setError(message);
        toast.error(message);
        return;
      }
      setDone(true);
      toast.success("Пароль обновлён");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div className="mt-8 flex flex-col gap-4">
        <p className="text-sm text-[var(--color-ink)]">
          Пароль обновлён. Теперь можно войти с новым паролем.
        </p>
        <Button asChild>
          <Link href="/login">Войти</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Новый пароль</Label>
        <PasswordInput
          id="password"
          placeholder="Минимум 8 символов"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm-password">Повторите пароль</Label>
        <PasswordInput
          id="confirm-password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
        />
      </div>
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      <Button type="submit" disabled={pending} className="mt-2">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Сохранить пароль
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <div className="mb-8 flex items-center gap-2">
        <Radio className="size-4 text-[var(--color-signal)]" />
        <span className="eyebrow">Пульс</span>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Новый пароль</h1>
      <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
        Придумайте новый пароль для входа в аккаунт.
      </p>
      <Suspense
        fallback={
          <div className="mt-8 flex justify-center text-[var(--color-ink-soft)]">
            <Loader2 className="size-5 animate-spin" />
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </main>
  );
}
