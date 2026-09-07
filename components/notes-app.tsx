"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Check,
  FileText,
  Folder,
  Loader2,
  Lock,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createNoteFolderSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";
import type { Note, NoteFolder } from "@/lib/models";

function formatRelativeDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function snippet(body: string): string {
  const clean = body.replace(/\s+/g, " ").trim();
  return clean.length > 80 ? clean.slice(0, 80) + "…" : clean;
}

export function NotesApp({
  initialFolders,
  initialNotes,
}: {
  initialFolders: NoteFolder[];
  initialNotes: Note[];
}) {
  const [folders, setFolders] = React.useState(initialFolders);
  const [notes, setNotes] = React.useState(initialNotes);
  const [selectedFolderId, setSelectedFolderId] = React.useState<string | null | "all">("all");
  const [selectedNoteId, setSelectedNoteId] = React.useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = React.useState(false);
  const [newFolderName, setNewFolderName] = React.useState("");

  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [saveStatus, setSaveStatus] = React.useState<"idle" | "saving" | "saved">("idle");
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectedNote = notes.find((n) => n.id === selectedNoteId) ?? null;

  React.useEffect(() => {
    setTitle(selectedNote?.title ?? "");
    setBody(selectedNote?.body ?? "");
    setSaveStatus("idle");
    // Намеренно: пересинхронизируем поля только при смене id заметки,
    // а не при каждом изменении title/body (иначе сбросим то, что печатает пользователь).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNote?.id]);

  const visibleNotes = notes
    .filter((n) => {
      if (selectedFolderId === "all") return true;
      return n.folderId === selectedFolderId;
    })
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  async function handleCreateFolder(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createNoteFolderSchema.safeParse({ name: newFolderName });
    if (!parsed.success) {
      toast.error(parsed.error.flatten().fieldErrors.name?.[0] ?? "Некорректное название");
      return;
    }
    const res = await fetch("/api/notes/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) {
      toast.error("Не удалось создать папку");
      return;
    }
    const data = await res.json();
    setFolders((prev) => [...prev, data.folder]);
    setNewFolderName("");
    setCreatingFolder(false);
  }

  async function handleDeleteFolder(folderId: string) {
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setNotes((prev) => prev.map((n) => (n.folderId === folderId ? { ...n, folderId: null } : n)));
    if (selectedFolderId === folderId) setSelectedFolderId("all");
    await fetch(`/api/notes/folders/${folderId}`, { method: "DELETE" });
  }

  async function handleCreateNote() {
    const folderId = selectedFolderId === "all" ? null : selectedFolderId;
    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "", body: "", folderId }),
    });
    if (!res.ok) {
      toast.error("Не удалось создать заметку");
      return;
    }
    const data = await res.json();
    setNotes((prev) => [data.note, ...prev]);
    setSelectedNoteId(data.note.id);
  }

  async function handleDeleteNote(noteId: string) {
    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    if (selectedNoteId === noteId) setSelectedNoteId(null);
    await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
    toast.success("Заметка удалена");
  }

  function scheduleSave(nextTitle: string, nextBody: string) {
    if (!selectedNote) return;
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/notes/${selectedNote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: nextTitle, body: nextBody }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes((prev) => prev.map((n) => (n.id === data.note.id ? data.note : n)));
        setSaveStatus("saved");
      } else {
        toast.error("Не удалось сохранить заметку");
        setSaveStatus("idle");
      }
    }, 700);
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    scheduleSave(value, body);
  }

  function handleBodyChange(value: string) {
    setBody(value);
    scheduleSave(title, value);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 rounded-(--radius-control) border border-[var(--color-line)] bg-[var(--color-signal-soft)] px-3 py-2 text-sm text-[var(--color-signal-ink)]">
        <Lock className="size-3.5 shrink-0" />
        Эти заметки личные — их видите только вы, даже администратор не имеет доступа.
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[180px_260px_1fr] md:items-start">
        {/* Папки */}
        <div className="panel flex flex-col gap-1 p-2 md:h-[65vh] md:overflow-y-auto">
          <button
            type="button"
            onClick={() => setSelectedFolderId("all")}
            className={cn(
              "flex items-center gap-2 rounded-(--radius-control) px-2.5 py-1.5 text-left text-sm",
              selectedFolderId === "all"
                ? "bg-[var(--color-signal-soft)] text-[var(--color-signal-ink)] font-medium"
                : "text-[var(--color-ink)] hover:bg-[var(--color-paper)]",
            )}
          >
            <StickyNote className="size-3.5" />
            Все заметки
            <span className="ml-auto font-mono text-xs text-[var(--color-ink-soft)]">
              {notes.length}
            </span>
          </button>

          {folders.map((folder) => {
            const count = notes.filter((n) => n.folderId === folder.id).length;
            return (
              <div key={folder.id} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => setSelectedFolderId(folder.id)}
                  className={cn(
                    "flex flex-1 items-center gap-2 rounded-(--radius-control) px-2.5 py-1.5 text-left text-sm",
                    selectedFolderId === folder.id
                      ? "bg-[var(--color-signal-soft)] text-[var(--color-signal-ink)] font-medium"
                      : "text-[var(--color-ink)] hover:bg-[var(--color-paper)]",
                  )}
                >
                  <Folder className="size-3.5 shrink-0" />
                  <span className="truncate">{folder.name}</span>
                  <span className="ml-auto font-mono text-xs text-[var(--color-ink-soft)]">
                    {count}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteFolder(folder.id)}
                  className="hidden shrink-0 rounded-(--radius-control) p-1 text-[var(--color-ink-soft)] hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)] group-hover:block"
                  aria-label="Удалить папку"
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}

          {creatingFolder ? (
            <form onSubmit={handleCreateFolder} className="mt-1 flex gap-1 px-1">
              <Input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onBlur={() => !newFolderName && setCreatingFolder(false)}
                placeholder="Название папки"
                className="h-8 text-sm"
              />
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreatingFolder(true)}
              className="mt-1 flex items-center gap-2 rounded-(--radius-control) px-2.5 py-1.5 text-left text-sm text-[var(--color-ink-soft)] hover:bg-[var(--color-paper)]"
            >
              <Plus className="size-3.5" /> Папка
            </button>
          )}
        </div>

        {/* Список заметок */}
        <div className="panel flex flex-col gap-1 p-2 md:h-[65vh] md:overflow-y-auto">
          <Button size="sm" className="mb-1" onClick={handleCreateNote}>
            <Plus className="size-3.5" /> Новая заметка
          </Button>

          {visibleNotes.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center">
              <FileText className="size-5 text-[var(--color-ink-soft)]" />
              <p className="text-xs text-[var(--color-ink-soft)]">Пока нет заметок</p>
            </div>
          ) : (
            visibleNotes.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => setSelectedNoteId(note.id)}
                className={cn(
                  "flex flex-col gap-0.5 rounded-(--radius-control) px-2.5 py-2 text-left",
                  selectedNoteId === note.id
                    ? "bg-[var(--color-signal-soft)]"
                    : "hover:bg-[var(--color-paper)]",
                )}
              >
                <span className="truncate text-sm font-medium">
                  {note.title || "Без названия"}
                </span>
                <span className="truncate text-xs text-[var(--color-ink-soft)]">
                  {formatRelativeDate(note.updatedAt)}
                  {note.body && ` · ${snippet(note.body)}`}
                </span>
              </button>
            ))
          )}
        </div>

        {/* Редактор */}
        <div className="panel flex flex-col gap-3 p-5 md:h-[65vh]">
          {selectedNote ? (
            <>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-[var(--color-ink-soft)]">
                  {saveStatus === "saving" && (
                    <>
                      <Loader2 className="size-3 animate-spin" /> Сохранение...
                    </>
                  )}
                  {saveStatus === "saved" && (
                    <>
                      <Check className="size-3" /> Сохранено
                    </>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteNote(selectedNote.id)}
                  className="text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                >
                  <Trash2 className="size-3.5" /> Удалить
                </Button>
              </div>
              <Input
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Название заметки"
                className="border-none bg-transparent px-0 text-lg font-semibold shadow-none focus-visible:ring-0"
              />
              <Textarea
                value={body}
                onChange={(e) => handleBodyChange(e.target.value)}
                placeholder="Начните печатать..."
                className="min-h-0 flex-1 resize-none border-none bg-transparent px-0 shadow-none focus-visible:ring-0"
              />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
              <StickyNote className="size-6 text-[var(--color-ink-soft)]" />
              <p className="text-sm text-[var(--color-ink-soft)]">
                Выберите заметку слева или создайте новую
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
