"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { registerSchema } from "@/lib/validation";

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<{ name?: string; email?: string; password?: string }>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = registerSchema.safeParse({ name, email, password });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors({ name: flat.name?.[0], email: flat.email?.[0], password: flat.password?.[0] });
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Не удалось зарегистрироваться");
        return;
      }
      const data = await res.json();
      toast.success(`Добро пожаловать, ${data.user.name.split(" ")[0]}`);
      router.push("/boards");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Имя</Label>
        <Input
          id="name"
          placeholder="Анна Соколова"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          autoFocus
        />
        {errors.name && <p className="text-xs text-[var(--color-danger)]">{errors.name}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Рабочий email</Label>
        <Input
          id="email"
          type="email"
          placeholder="anna@team.dev"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        {errors.email && <p className="text-xs text-[var(--color-danger)]">{errors.email}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Пароль</Label>
        <PasswordInput
          id="password"
          placeholder="Минимум 8 символов"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
        />
        {errors.password && <p className="text-xs text-[var(--color-danger)]">{errors.password}</p>}
      </div>
      <Button type="submit" disabled={pending} className="mt-2">
        {pending && <Loader2 className="size-4 animate-spin" />}
        Создать аккаунт
      </Button>
    </form>
  );
}
