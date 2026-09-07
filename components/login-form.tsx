"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { loginSchema } from "@/lib/validation";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors({ email: flat.email?.[0], password: flat.password?.[0] });
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Не удалось войти");
        return;
      }
      const data = await res.json();
      toast.success(`С возвращением, ${data.user.name.split(" ")[0]}`);
      router.push("/boards");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
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
        />
        {errors.email && <p className="text-xs text-[var(--color-danger)]">{errors.email}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor="password">Пароль</Label>
          <Link
            href="/forgot-password"
            className="text-xs font-medium text-[var(--color-signal)] hover:underline"
          >
            Забыли пароль?
          </Link>
        </div>
        <PasswordInput
          id="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {errors.password && <p className="text-xs text-[var(--color-danger)]">{errors.password}</p>}
      </div>
      <Button type="submit" disabled={pending} className="mt-2">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Войти
      </Button>
    </form>
  );
}
