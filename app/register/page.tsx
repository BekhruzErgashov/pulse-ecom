import { redirect } from "next/navigation";
import Link from "next/link";
import { Radio } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { RegisterForm } from "@/components/register-form";

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect("/boards");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-16">
      <div className="mb-8 flex items-center gap-2">
        <Radio className="size-4 text-[var(--color-signal)]" />
        <span className="eyebrow">Пульс</span>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Создать аккаунт</h1>
      <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
        Зарегистрироваться может только тот, чей email добавлен администратором
        в список разрешённых.
      </p>
      <RegisterForm />
      <p className="mt-6 text-sm text-[var(--color-ink-soft)]">
        Уже есть аккаунт?{" "}
        <Link href="/login" className="font-medium text-[var(--color-signal)] hover:underline">
          Войти
        </Link>
      </p>
    </main>
  );
}
