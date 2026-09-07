import { redirect } from "next/navigation";
import Link from "next/link";
import { Radio } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { seedIfEmpty } from "@/lib/data";
import { LoginForm } from "@/components/login-form";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function LoginPage() {
  await seedIfEmpty();
  const user = await getCurrentUser();
  if (user) redirect("/boards");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <div className="mb-8 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radio className="size-4 text-[var(--color-signal)]" />
          <span className="eyebrow">Пульс</span>
        </div>
        <ThemeToggle />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Вход в команду</h1>
      <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
        Введите email и пароль от вашего аккаунта.
      </p>
      <LoginForm />
      <p className="mt-6 text-sm text-[var(--color-ink-soft)]">
        Нет аккаунта?{" "}
        <Link href="/register" className="font-medium text-[var(--color-signal)] hover:underline">
          Зарегистрироваться
        </Link>
      </p>
    </main>
  );
}
