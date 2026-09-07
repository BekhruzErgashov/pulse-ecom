import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/session";
import { seedIfEmpty } from "@/lib/data";
import { StageRailPreview } from "@/components/stage-rail-preview";
import { ThemeToggle } from "@/components/theme-toggle";

export default async function Home() {
  await seedIfEmpty();
  const user = await getCurrentUser();
  if (user) redirect("/boards");

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-6 py-16">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Radio className="size-4 text-[var(--color-signal)]" />
          <span className="eyebrow">Пульс</span>
        </div>
        <ThemeToggle />
      </header>

      <section className="mt-20 flex flex-col gap-8">
        <div>
          <p className="eyebrow mb-3">Трекер задач для команды</p>
          <h1 className="max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Видно, на каком этапе застряла каждая задача.
          </h1>
          <p className="mt-5 max-w-xl text-base text-[var(--color-ink-soft)]">
            Доски задач с рельсом этапов вместо унылого списка. Отдельные
            пространства для разных команд, вопросы напрямую нужным людям.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link href="/login">
              Войти <ArrowRight className="size-4" />
            </Link>
          </Button>
          <span className="text-sm text-[var(--color-ink-soft)]">
            Доступ выдаёт администратор команды.
          </span>
        </div>

        <div className="mt-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <StageRailPreview />
        </div>
      </section>
    </main>
  );
}
