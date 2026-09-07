import Link from "next/link";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

export function NoWorkspaceState({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center animate-in fade-in duration-300">
      <div className="flex size-12 items-center justify-center rounded-full bg-[var(--color-paper)] text-[var(--color-ink-soft)]">
        <Layers className="size-5" />
      </div>
      <p className="text-sm font-medium">У вас пока нет доступа ни к одному пространству</p>
      <p className="max-w-sm text-sm text-[var(--color-ink-soft)]">
        {isAdmin
          ? "Создайте пространство в админ-панели и добавьте туда участников."
          : "Обратитесь к администратору — он добавит вас в рабочее пространство команды."}
      </p>
      {isAdmin && (
        <Button asChild className="mt-2">
          <Link href="/admin">Перейти в админ-панель</Link>
        </Button>
      )}
    </div>
  );
}
