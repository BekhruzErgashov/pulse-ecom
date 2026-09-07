"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, ArrowUpRight, Globe, Link2Off, Search, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CreateLinkDialog } from "@/components/create-link-dialog";
import type { WorkLink } from "@/lib/models";

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function QuickLinks({
  workspaceId,
  initialLinks,
}: {
  workspaceId: string;
  initialLinks: WorkLink[];
}) {
  const [links, setLinks] = React.useState(initialLinks);
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return links;
    return links.filter(
      (l) =>
        l.title.toLowerCase().includes(q) ||
        l.description.toLowerCase().includes(q) ||
        l.url.toLowerCase().includes(q),
    );
  }, [links, query]);

  function handleDelete(link: WorkLink) {
    toast(`Удалить ссылку «${link.title}»?`, {
      description: "Она пропадёт у всех участников пространства.",
      action: {
        label: "Удалить",
        onClick: async () => {
          const prev = links;
          setLinks((current) => current.filter((l) => l.id !== link.id));
          const res = await fetch(`/api/links/${link.id}`, { method: "DELETE" });
          if (!res.ok) {
            setLinks(prev);
            toast.error("Не удалось удалить ссылку");
            return;
          }
          toast.success("Ссылка удалена");
        },
      },
      cancel: { label: "Отмена", onClick: () => {} },
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="eyebrow mb-1">Ссылки</p>
          <h1 className="text-2xl font-semibold tracking-tight">Рабочие сервисы</h1>
        </div>
        <Link
          href={`/w/${workspaceId}/boards`}
          className="flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-paper-raised)] px-3 py-1.5 text-sm font-medium text-[var(--color-ink-soft)] shadow-sm transition-colors hover:border-[var(--color-signal)] hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-3.5" /> Все доски
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-soft)]" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по ссылкам"
            className="pl-9"
          />
        </div>
        <CreateLinkDialog
          workspaceId={workspaceId}
          onCreated={(link) => setLinks((prev) => [link, ...prev])}
        />
      </div>

      {links.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center animate-in fade-in duration-300">
          <div className="flex size-12 items-center justify-center rounded-full bg-[var(--color-paper)] text-[var(--color-ink-soft)]">
            <Globe className="size-5" />
          </div>
          <p className="text-sm font-medium">Пока нет ни одной ссылки</p>
          <p className="max-w-sm text-sm text-[var(--color-ink-soft)]">
            Добавьте сервисы, с которыми работает команда — они появятся здесь для всех участников пространства.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-16 text-center animate-in fade-in duration-300">
          <div className="flex size-12 items-center justify-center rounded-full bg-[var(--color-paper)] text-[var(--color-ink-soft)]">
            <Link2Off className="size-5" />
          </div>
          <p className="text-sm font-medium">Ничего не найдено</p>
          <p className="max-w-sm text-sm text-[var(--color-ink-soft)]">
            Попробуйте изменить запрос поиска.
          </p>
        </div>
      ) : (
        <div className="panel divide-y divide-[var(--color-line)]">
          {filtered.map((link) => (
            <div
              key={link.id}
              className="group flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--color-paper)]"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-signal-soft)] text-[var(--color-signal-ink)]">
                <Globe className="size-4" />
              </div>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1"
              >
                <p className="truncate text-sm font-medium">{link.title}</p>
                <p className="truncate text-xs text-[var(--color-ink-soft)]">
                  {hostname(link.url)}
                  {link.description ? ` · ${link.description}` : ""}
                </p>
              </a>
              <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Button variant="ghost" size="icon" asChild>
                  <a href={link.url} target="_blank" rel="noopener noreferrer" aria-label="Открыть">
                    <ArrowUpRight className="size-4" />
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(link)}
                  className="text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                  aria-label="Удалить"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
