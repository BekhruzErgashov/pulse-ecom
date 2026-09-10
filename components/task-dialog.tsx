"use client";

import * as React from "react";
import { useDarkGlass } from "@/lib/use-dark-glass";
import { toast } from "sonner";
import {
  Archive,
  FileText,
  CalendarClock,
  Check,
  ChevronDown,
  Flame,
  Loader2,
  Paperclip,
  Pencil,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssigneeMultiSelect } from "@/components/assignee-multi-select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PRIORITIES, STAGES } from "@/lib/schema";
import { createTaskSchema, updateTaskSchema } from "@/lib/validation";
import { isOverdue as checkOverdue } from "@/lib/task-sort";
import { linkifyText } from "@/lib/linkify";
import type { Task, TaskAttachmentMeta, TaskEvent, User } from "@/lib/models";
import { cn } from "@/lib/utils";
import { ALLOWED_ATTACHMENT_TYPES } from "@/lib/validation";

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const MAX_COMMENT_LENGTH = 2000;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

/**
 * Плитка вложения: картинки показываем превью, остальные файлы — иконкой с
 * названием. Используется и для уже сохранённых вложений, и для тех, что
 * выбраны в форме новой задачи и ещё не отправлены на сервер.
 */
function AttachmentTile({
  href,
  filename,
  contentType,
  sizeBytes,
  onRemove,
}: {
  href: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  onRemove?: () => void;
}) {
  const isImage = contentType.startsWith("image/");
  const title = `${filename} · ${formatFileSize(sizeBytes)}`;

  return (
    <div className="group relative">
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={title}
        className="block h-20 w-20 overflow-hidden rounded-(--radius-control) border border-[var(--color-line)]"
      >
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={href} alt={filename} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 bg-[var(--color-paper)] p-1 text-center">
            <FileText className="size-5 text-[var(--color-ink-soft)]" />
            <span className="line-clamp-2 break-all text-[10px] leading-tight text-[var(--color-ink-soft)]">
              {filename}
            </span>
          </span>
        )}
      </a>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Удалить файл «${filename}»`}
          className="absolute -right-1.5 -top-1.5 hidden size-5 items-center justify-center rounded-full bg-[var(--color-danger)] text-[var(--color-on-accent)] group-hover:flex"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  members: User[];
  task?: Task;
  currentUserEmail: string;
  defaultStage?: Task["stage"];
  onCreated?: (task: Task) => void;
  onUpdated?: (task: Task) => void;
  onDeleted?: (taskId: string) => void;
  /** Задачу убрали в архив — с доски она пропадает так же, как при удалении, но остаётся в архиве. */
  onArchived?: (taskId: string) => void;
}

const PRIORITY_VARIANT: Record<Task["priority"], "outline" | "danger" | "urgent"> = {
  low: "outline",
  medium: "outline",
  high: "danger",
  urgent: "urgent",
};

// <input type="datetime-local"> ожидает "YYYY-MM-DDTHH:mm" в локальном времени,
// а храним ISO-строку (UTC). Конвертируем в обе стороны.
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatEventTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function memberName(email: string | null, members: User[]): string {
  if (!email) return "Неизвестный";
  return members.find((m) => m.email === email)?.name ?? email;
}

function memberColor(email: string | null, members: User[]): string | undefined {
  if (!email) return undefined;
  return members.find((m) => m.email === email)?.color;
}

function assigneeValueLabel(email: string | null, members: User[]): string {
  return email ? memberName(email, members) : "не назначен";
}

function dueDateValueLabel(iso: string | null): string {
  if (!iso) return "без срока";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "без срока";
  return d.toLocaleDateString("ru-RU");
}

// Автоматическая запись в истории задачи — краткое описание системного события.
function describeSystemEvent(ev: TaskEvent, members: User[]): string {
  const author = memberName(ev.authorEmail, members);
  switch (ev.type) {
    case "created":
      return `${author} создал(а) задачу`;
    case "stage_changed": {
      const from = STAGES.find((s) => s.id === ev.fromValue)?.label ?? ev.fromValue ?? "—";
      const to = STAGES.find((s) => s.id === ev.toValue)?.label ?? ev.toValue ?? "—";
      return `${author} изменил(а) этап: ${from} → ${to}`;
    }
    case "priority_changed": {
      const from = PRIORITIES.find((p) => p.id === ev.fromValue)?.label ?? ev.fromValue ?? "—";
      const to = PRIORITIES.find((p) => p.id === ev.toValue)?.label ?? ev.toValue ?? "—";
      return `${author} изменил(а) приоритет: ${from} → ${to}`;
    }
    case "assignee_changed": {
      const from = assigneeValueLabel(ev.fromValue, members);
      const to = assigneeValueLabel(ev.toValue, members);
      return `${author} изменил(а) исполнителя: ${from} → ${to}`;
    }
    case "due_date_changed": {
      const from = dueDateValueLabel(ev.fromValue);
      const to = dueDateValueLabel(ev.toValue);
      return `${author} изменил(а) срок: ${from} → ${to}`;
    }
    default:
      return author;
  }
}

export function TaskDialog({
  open,
  onOpenChange,
  boardId,
  members,
  task,
  currentUserEmail,
  defaultStage,
  onCreated,
  onUpdated,
  onDeleted,
  onArchived,
}: TaskDialogProps) {
  const isEdit = Boolean(task);
  // Администратор управляет любой задачей: у человека может быть два
  // аккаунта, а коллега — уйти из команды, и его задачи иначе остались бы
  // без хозяина (ни изменить, ни архивировать, ни удалить). Роль берём из
  // списка участников — отдельный проп для этого не нужен.
  const isAdmin = members.some((m) => m.email === currentUserEmail && m.role === "admin");
  // Создатель (или если создатель не известен/удалён — доступно всем
  // с доступом к доске) видит кнопки управления задачей.
  const canFullyEdit = !task || !task.createdBy || task.createdBy === currentUserEmail || isAdmin;
  // Комментарий исполнителя редактирует только сам исполнитель.
  const canEditComment = Boolean(task && task.assigneeEmails.includes(currentUserEmail));
  // Скриншоты может прикреплять и создатель, и исполнитель задачи.
  const canManageAttachments = canFullyEdit || canEditComment;

  const isDarkGlass = useDarkGlass();

  const [mode, setMode] = React.useState<"view" | "edit">(isEdit ? "view" : "edit");

  const [title, setTitle] = React.useState(task?.title ?? "");
  const [description, setDescription] = React.useState(task?.description ?? "");
  const [priority, setPriority] = React.useState<Task["priority"]>(task?.priority ?? "medium");
  const [stage, setStage] = React.useState<Task["stage"]>(task?.stage ?? defaultStage ?? "todo");
  const [assigneeEmails, setAssigneeEmails] = React.useState<string[]>(task?.assigneeEmails ?? []);
  const [dueDate, setDueDate] = React.useState(isoToLocalInput(task?.dueDate ?? null));
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  // Отдельное состояние для быстрого сохранения этапа/комментария из
  // режима просмотра — не завязано на полную форму редактирования.
  const [quickStage, setQuickStage] = React.useState<Task["stage"]>(task?.stage ?? "todo");
  const [quickComment, setQuickComment] = React.useState(task?.resultNote ?? "");
  const [quickPending, setQuickPending] = React.useState(false);

  const [attachments, setAttachments] = React.useState<TaskAttachmentMeta[]>([]);
  // Файлы, выбранные в форме новой задачи. Отправить их сразу нельзя — у
  // вложения обязателен taskId, а задачи ещё нет; поэтому держим их здесь и
  // загружаем сразу после успешного создания.
  const [pendingFiles, setPendingFiles] = React.useState<
    { filename: string; contentType: string; data: string; sizeBytes: number }[]
  >([]);
  const [attachmentsLoading, setAttachmentsLoading] = React.useState(false);
  const [uploadPending, setUploadPending] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const [events, setEvents] = React.useState<TaskEvent[]>([]);
  const [eventsLoading, setEventsLoading] = React.useState(false);
  const [newComment, setNewComment] = React.useState("");
  const [commentPending, setCommentPending] = React.useState(false);
  // Свёрнуто по умолчанию — история не всегда нужна сразу, а место в
  // диалоге задачи ограничено (комментарии могут накопиться и растянуть
  // окно). Список/поле ввода комментария рендерятся только при раскрытии.
  const [historyOpen, setHistoryOpen] = React.useState(false);

  React.useEffect(() => {
    if (open && task) {
      setAttachmentsLoading(true);
      fetch(`/api/tasks/${task.id}/attachments`)
        .then((res) => (res.ok ? res.json() : { attachments: [] }))
        .then((data) => setAttachments(data.attachments ?? []))
        .catch(() => setAttachments([]))
        .finally(() => setAttachmentsLoading(false));
    } else {
      setAttachments([]);
      setPendingFiles([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  React.useEffect(() => {
    setHistoryOpen(false);
    if (open && task) {
      setEventsLoading(true);
      fetch(`/api/tasks/${task.id}/events`)
        .then((res) => (res.ok ? res.json() : { events: [] }))
        .then((data) => setEvents(data.events ?? []))
        .catch(() => setEvents([]))
        .finally(() => setEventsLoading(false));
    } else {
      setEvents([]);
      setNewComment("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id]);

  async function handlePostComment() {
    if (!task) return;
    const body = newComment.trim();
    if (!body) return;
    setCommentPending(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Не удалось отправить комментарий");
        return;
      }
      const data = await res.json();
      setEvents((prev) => [...prev, data.event]);
      setNewComment("");
    } finally {
      setCommentPending(false);
    }
  }

  /**
   * Выбранные файлы. У существующей задачи отправляем сразу, у новой —
   * складываем в pendingFiles и грузим после её создания (у вложения
   * обязателен taskId).
   */
  async function uploadAttachments(files: File[] | FileList) {
    const picked = Array.from(files).filter((f) =>
      (ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(f.type.toLowerCase()),
    );
    const rejected = Array.from(files).length - picked.length;
    if (rejected > 0) toast.error("Такой тип файла прикрепить нельзя: " + rejected);
    if (picked.length === 0) return;

    setUploadPending(true);
    try {
      for (const file of picked) {
        const already = task ? attachments.length : pendingFiles.length;
        if (already >= MAX_ATTACHMENTS) {
          toast.error("Не больше " + MAX_ATTACHMENTS + " файлов на задачу");
          break;
        }
        if (file.size > MAX_ATTACHMENT_SIZE) {
          toast.error("Файл «" + file.name + "» больше 5 МБ");
          continue;
        }
        const data = await fileToBase64(file);

        if (!task) {
          setPendingFiles((prev) => [
            ...prev,
            {
              filename: file.name || "file",
              contentType: file.type,
              data,
              sizeBytes: file.size,
            },
          ]);
          continue;
        }

        const res = await fetch("/api/tasks/" + task.id + "/attachments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name || "file",
            contentType: file.type,
            data,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          toast.error(errData?.error ?? "Не удалось прикрепить файл");
          continue;
        }
        const resData = await res.json();
        setAttachments((prev) => [...prev, resData.attachment]);
      }
    } finally {
      setUploadPending(false);
    }
  }

  /** Догружает файлы, выбранные до создания задачи, когда её id уже известен. */
  async function uploadPendingTo(taskId: string) {
    for (const file of pendingFiles) {
      const res = await fetch("/api/tasks/" + taskId + "/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.filename,
          contentType: file.contentType,
          data: file.data,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        toast.error("Файл «" + file.filename + "» не прикрепился: " + (errData?.error ?? "ошибка"));
      }
    }
    setPendingFiles([]);
  }

  async function handleDeleteAttachment(attachmentId: string) {
    if (!task) return;
    const res = await fetch(`/api/tasks/${task.id}/attachments/${attachmentId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      toast.error(errData?.error ?? "Не удалось удалить файл");
      return;
    }
    setAttachments((prev) => prev.filter((a) => a.id !== attachmentId));
  }

  /** Ctrl+V скриншота — исходный сценарий; из буфера прилетают именно картинки. */
  function handleAttachmentsPaste(e: React.ClipboardEvent) {
    if (!canManageAttachments) return;
    const files = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((f): f is File => Boolean(f));
    if (files.length === 0) return;
    e.preventDefault();
    void uploadAttachments(files);
  }

  React.useEffect(() => {
    if (open) {
      setMode(isEdit ? "view" : "edit");
      setTitle(task?.title ?? "");
      setDescription(task?.description ?? "");
      setPriority(task?.priority ?? "medium");
      setStage(task?.stage ?? defaultStage ?? "todo");
      setAssigneeEmails(task?.assigneeEmails ?? []);
      setDueDate(isoToLocalInput(task?.dueDate ?? null));
      setQuickStage(task?.stage ?? "todo");
      setQuickComment(task?.resultNote ?? "");
      setError(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, defaultStage]);


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const commonFields = {
        title,
        description,
        priority,
        assigneeEmails,
        dueDate: localInputToIso(dueDate),
      };

      if (isEdit && task) {
        const parsed = updateTaskSchema.safeParse({ ...commonFields, stage });
        if (!parsed.success) {
          setError(parsed.error.flatten().fieldErrors.title?.[0]);
          return;
        }
        const res = await fetch(`/api/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          toast.error(data?.error ?? "Не удалось сохранить");
          return;
        }
        const data = await res.json();
        onUpdated?.(data.task);
        toast.success("Задача обновлена");
        onOpenChange(false);
      } else {
        const parsed = createTaskSchema.safeParse({ ...commonFields, boardId });
        if (!parsed.success) {
          setError(parsed.error.flatten().fieldErrors.title?.[0]);
          return;
        }
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          toast.error(data?.error ?? "Не удалось создать задачу");
          return;
        }
        const data = await res.json();
        // Сначала файлы, потом закрытие: иначе диалог исчезнет раньше, чем
        // загрузка закончится, и ошибку по конкретному файлу никто не увидит.
        if (pendingFiles.length > 0) await uploadPendingTo(data.task.id);
        onCreated?.(data.task);
        toast.success(
          pendingFiles.length > 0
            ? `Задача создана, файлов прикреплено: ${pendingFiles.length}`
            : "Задача создана",
        );
        onOpenChange(false);
      }
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    setPending(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Не удалось удалить задачу");
        return;
      }
      onDeleted?.(task.id);
      toast.success("Задача удалена");
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  /** Удаление необратимо, поэтому спрашиваем подтверждение — в отличие от архива, который всегда можно отменить. */
  function confirmDelete() {
    if (!task) return;
    toast(`Удалить задачу «${task.title}»?`, {
      description: "Восстановить не получится. Если задача может ещё понадобиться — уберите её в архив.",
      action: { label: "Удалить", onClick: () => void handleDelete() },
      cancel: { label: "Отмена", onClick: () => {} },
    });
  }

  async function handleArchive() {
    if (!task) return;
    setPending(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: true }),
      });
      if (!res.ok) {
        toast.error("Не удалось убрать задачу в архив");
        return;
      }
      onArchived?.(task.id);
      toast.success("Задача в архиве", { description: "Вернуть можно кнопкой «Архив» над доской." });
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  async function handleQuickSave() {
    if (!task) return;
    setQuickPending(true);
    try {
      const patch: Record<string, unknown> = {};
      if (quickStage !== task.stage) patch.stage = quickStage;
      if (canEditComment && quickComment !== (task.resultNote ?? "")) {
        patch.resultNote = quickComment || null;
      }
      if (Object.keys(patch).length === 0) {
        onOpenChange(false);
        return;
      }

      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "Не удалось сохранить");
        return;
      }
      const data = await res.json();
      onUpdated?.(data.task);
      toast.success("Сохранено");
      onOpenChange(false);
    } finally {
      setQuickPending(false);
    }
  }

  // Блок вложений одинаков для формы новой задачи и для просмотра готовой —
  // отличается только источник: у новой файлы лежат в pendingFiles, у готовой
  // приходят с сервера.
  const attachedCount = task ? attachments.length : pendingFiles.length;
  const attachmentsSection = (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-ink-soft)]">
          Файлы {attachedCount > 0 && `(${attachedCount}/${MAX_ATTACHMENTS})`}
        </p>
        {canManageAttachments && (
          <Button
            type="button"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadPending || attachedCount >= MAX_ATTACHMENTS}
          >
            {uploadPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Paperclip className="size-3.5" />
            )}
            Прикрепить
          </Button>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_ATTACHMENT_TYPES.join(",")}
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void uploadAttachments(e.target.files);
          e.target.value = "";
        }}
      />
      {attachmentsLoading ? (
        <p className="text-xs text-[var(--color-ink-soft)]">Загрузка…</p>
      ) : attachedCount > 0 ? (
        <div className="flex flex-wrap gap-2">
          {task
            ? attachments.map((a) => (
                <AttachmentTile
                  key={a.id}
                  href={`/api/tasks/${task.id}/attachments/${a.id}`}
                  filename={a.filename}
                  contentType={a.contentType}
                  sizeBytes={a.sizeBytes}
                  onRemove={
                    canManageAttachments || a.uploadedBy === currentUserEmail
                      ? () => handleDeleteAttachment(a.id)
                      : undefined
                  }
                />
              ))
            : pendingFiles.map((f, i) => (
                <AttachmentTile
                  key={`${f.filename}-${i}`}
                  href={`data:${f.contentType};base64,${f.data}`}
                  filename={f.filename}
                  contentType={f.contentType}
                  sizeBytes={f.sizeBytes}
                  onRemove={() => setPendingFiles((prev) => prev.filter((_, idx) => idx !== i))}
                />
              ))}
        </div>
      ) : (
        canManageAttachments && (
          <p className="text-xs text-[var(--color-ink-soft)]">
            Вставьте скриншот из буфера (Ctrl+V) или нажмите «Прикрепить» — картинки, PDF,
            документы, таблицы, архивы. До {MAX_ATTACHMENTS} файлов, каждый до 5 МБ.
          </p>
        )
      )}
    </div>
  );

  if (!task) {
    // Создание новой задачи — сразу форма, режима просмотра ещё нет.
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle
              className={
                isDarkGlass
                  ? "font-display text-[32px] leading-[1.1] font-bold tracking-[-0.02em] text-white"
                  : undefined
              }
            >
              Новая задача
            </DialogTitle>
          </DialogHeader>
          <TaskForm
            title={title}
            setTitle={setTitle}
            description={description}
            setDescription={setDescription}
            priority={priority}
            setPriority={setPriority}
            assigneeEmails={assigneeEmails}
            setAssigneeEmails={setAssigneeEmails}
            dueDate={dueDate}
            setDueDate={setDueDate}
            members={members}
            error={error}
            showStage={false}
            stage={stage}
            setStage={setStage}
          />
          <div className="border-t border-[var(--color-line)] pt-4" onPaste={handleAttachmentsPaste}>
            {attachmentsSection}
          </div>
          <form onSubmit={handleSubmit}>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
              <Button type="submit" disabled={pending || !title.trim()}>
                {pending && <Loader2 className="size-4 animate-spin" />}
                Создать
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    );
  }

  const priorityLabel = PRIORITIES.find((p) => p.id === task.priority)?.label;
  const stageLabel = STAGES.find((s) => s.id === task.stage)?.label;
  const assignees = members.filter((m) => task.assigneeEmails.includes(m.email));
  const overdue = checkOverdue(task);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Чуть шире формы создания: в футере просмотра три действия слева
          («Изменить», «В архив», «Удалить») — на max-w-lg они переносились. */}
      <DialogContent className="max-w-xl">
        {mode === "view" ? (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <DialogTitle
                  className={cn(
                    "flex items-center gap-1.5",
                    isDarkGlass &&
                      "font-display gap-2.5 text-[28px] leading-[1.08] font-bold tracking-[-0.02em] text-white",
                  )}
                >
                  {task.priority === "urgent" && (
                    <Flame className="size-4 shrink-0 text-[var(--color-urgent)]" />
                  )}
                  {task.title}
                </DialogTitle>
              </div>
            </DialogHeader>

            <div className="flex flex-col gap-4" onPaste={handleAttachmentsPaste}>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={PRIORITY_VARIANT[task.priority]}>{priorityLabel}</Badge>
                <Badge variant="outline">{stageLabel}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="mb-1 text-xs text-[var(--color-ink-soft)]">
                    {assignees.length > 1 ? "Исполнители" : "Исполнитель"}
                  </p>
                  {assignees.length > 0 ? (
                    <div className="flex flex-col gap-1">
                      {assignees.map((a) => (
                        <div key={a.email} className="flex items-center gap-2">
                          <Avatar name={a.name} color={a.color} size="sm" />
                          <span>{a.name}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="flex items-center gap-1.5 text-[var(--color-ink-soft)]">
                      <UserIcon className="size-3.5" /> Не назначен
                    </span>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs text-[var(--color-ink-soft)]">Дедлайн</p>
                  {task.dueDate ? (
                    <span
                      className={`flex items-center gap-1.5 ${overdue ? "font-medium text-[var(--color-danger)]" : ""}`}
                    >
                      <CalendarClock className="size-3.5" />
                      {formatDateTime(task.dueDate)}
                    </span>
                  ) : (
                    <span className="text-[var(--color-ink-soft)]">Без срока</span>
                  )}
                </div>
              </div>

              {task.description && (
                <div>
                  <p className="mb-1 text-xs text-[var(--color-ink-soft)]">Описание</p>
                  <p className="whitespace-pre-wrap break-all rounded-(--radius-control) bg-[var(--color-paper)] p-3 text-sm [overflow-wrap:anywhere]">
                    {linkifyText(task.description)}
                  </p>
                </div>
              )}

              <div className="border-t border-[var(--color-line)] pt-4">{attachmentsSection}</div>

              <div className="flex flex-col gap-1.5 border-t border-[var(--color-line)] pt-4">
                <Label htmlFor="quick-stage">Этап</Label>
                <Select
                  id="quick-stage"
                  value={quickStage}
                  onChange={(e) => setQuickStage(e.target.value as Task["stage"])}
                >
                  {STAGES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="quick-comment">Комментарий исполнителя</Label>
                {canEditComment ? (
                  <>
                    <Textarea
                      id="quick-comment"
                      value={quickComment}
                      onChange={(e) => setQuickComment(e.target.value)}
                      placeholder="Расскажите, как выполняется или выполнена задача"
                    />
                    <p className="text-xs text-[var(--color-ink-soft)]">
                      Это поле видит постановщик задачи — держите его в курсе деталей исполнения.
                    </p>
                  </>
                ) : task.resultNote ? (
                  <p className="whitespace-pre-wrap break-all rounded-(--radius-control) bg-[var(--color-paper)] p-3 text-sm [overflow-wrap:anywhere]">
                    {linkifyText(task.resultNote)}
                  </p>
                ) : (
                  <p className="text-sm text-[var(--color-ink-soft)]">
                    {assignees.length > 0
                      ? "Исполнитель пока ничего не написал."
                      : "Комментарий сможет оставить исполнитель, когда он будет назначен."}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-[var(--color-line)] pt-4">
                <button
                  type="button"
                  onClick={() => setHistoryOpen((v) => !v)}
                  className="flex items-center justify-between gap-2 text-left"
                  aria-expanded={historyOpen}
                >
                  <span className="flex items-center gap-1.5 text-xs text-[var(--color-ink-soft)]">
                    История
                    {!eventsLoading && events.length > 0 && (
                      <span className="rounded-full bg-[var(--color-paper)] px-1.5 py-0.5 font-mono text-[10px]">
                        {events.length}
                      </span>
                    )}
                    {eventsLoading && <Loader2 className="size-3 animate-spin" />}
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-3.5 text-[var(--color-ink-soft)] transition-transform",
                      historyOpen && "rotate-180",
                    )}
                  />
                </button>

                {historyOpen && (
                  <>
                    {eventsLoading ? (
                      <p className="flex items-center gap-1.5 text-xs text-[var(--color-ink-soft)]">
                        <Loader2 className="size-3.5 animate-spin" /> Загрузка…
                      </p>
                    ) : events.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {events.map((ev) =>
                          ev.type === "comment" ? (
                            <div key={ev.id} className="flex items-start gap-2">
                              <Avatar
                                name={memberName(ev.authorEmail, members)}
                                color={memberColor(ev.authorEmail, members)}
                                size="sm"
                              />
                              <div className="flex flex-1 flex-col gap-0.5 rounded-(--radius-control) bg-[var(--color-paper)] p-2 text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">{memberName(ev.authorEmail, members)}</span>
                                  <span className="text-xs text-[var(--color-ink-soft)]">
                                    {formatEventTime(ev.createdAt)}
                                  </span>
                                </div>
                                <p className="whitespace-pre-wrap break-all [overflow-wrap:anywhere]">
                                  {linkifyText(ev.body ?? "")}
                                </p>
                              </div>
                            </div>
                          ) : (
                            <p key={ev.id} className="text-xs text-[var(--color-ink-soft)]">
                              {describeSystemEvent(ev, members)} · {formatEventTime(ev.createdAt)}
                            </p>
                          ),
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--color-ink-soft)]">Пока нет истории.</p>
                    )}
                    <div className="flex flex-col gap-1.5 pt-1">
                      <Textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Написать комментарий…"
                        maxLength={MAX_COMMENT_LENGTH}
                      />
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          className="h-8 px-3 text-xs"
                          onClick={handlePostComment}
                          disabled={commentPending || !newComment.trim()}
                        >
                          {commentPending && <Loader2 className="size-3.5 animate-spin" />}
                          Отправить
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            <DialogFooter className="justify-between sm:justify-between">
              <div className="flex shrink-0 items-center gap-0.5">
                {canFullyEdit && (
                  <>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setMode("edit")}>
                      <Pencil className="size-3.5" /> Изменить
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleArchive}
                      disabled={pending}
                      className="text-[var(--color-ink-soft)]"
                    >
                      <Archive className="size-3.5" /> В архив
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={confirmDelete}
                      disabled={pending}
                      className="text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                    >
                      <Trash2 className="size-3.5" /> Удалить
                    </Button>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Закрыть
                </Button>
                <Button type="button" onClick={handleQuickSave} disabled={quickPending}>
                  {quickPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Сохранить
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Задача</DialogTitle>
            </DialogHeader>
            <TaskForm
              title={title}
              setTitle={setTitle}
              description={description}
              setDescription={setDescription}
              priority={priority}
              setPriority={setPriority}
              assigneeEmails={assigneeEmails}
              setAssigneeEmails={setAssigneeEmails}
              dueDate={dueDate}
              setDueDate={setDueDate}
              members={members}
              error={error}
              showStage
              stage={stage}
              setStage={setStage}
            />
            <form onSubmit={handleSubmit}>
              <DialogFooter className="justify-between sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={confirmDelete}
                  disabled={pending}
                  className="text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                >
                  <Trash2 className="size-4" /> Удалить
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setMode("view")}>
                    Отмена
                  </Button>
                  <Button type="submit" disabled={pending || !title.trim()}>
                    {pending && <Loader2 className="size-4 animate-spin" />}
                    Сохранить
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TaskForm({
  title,
  setTitle,
  description,
  setDescription,
  priority,
  setPriority,
  assigneeEmails,
  setAssigneeEmails,
  dueDate,
  setDueDate,
  members,
  error,
  showStage,
  stage,
  setStage,
}: {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  priority: Task["priority"];
  setPriority: (v: Task["priority"]) => void;
  assigneeEmails: string[];
  setAssigneeEmails: (v: string[]) => void;
  dueDate: string;
  setDueDate: (v: string) => void;
  members: User[];
  error: string | undefined;
  showStage: boolean;
  stage: Task["stage"];
  setStage: (v: Task["stage"]) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="task-title">Название</Label>
        <Input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Что нужно сделать"
          autoFocus
        />
        {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="task-description">Описание</Label>
        <Textarea
          id="task-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Детали, контекст, ссылки — что нужно знать, чтобы выполнить задачу"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {showStage && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-stage">Этап</Label>
            <Select id="task-stage" value={stage} onChange={(e) => setStage(e.target.value as Task["stage"])}>
              {STAGES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-priority">Приоритет</Label>
          <Select
            id="task-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as Task["priority"])}
          >
            {PRIORITIES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-assignee">Исполнители</Label>
          {/* Выпадающий мультивыбор, а не раскрытый список чекбоксов: список
              участников занимал полформы, а выбор делается редко — по правке
              пользователя сначала открываем меню, потом отмечаем людей. */}
          <AssigneeMultiSelect
            id="task-assignee"
            members={members}
            value={assigneeEmails}
            onChange={setAssigneeEmails}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-due">Срок (дата и время)</Label>
          <Input
            id="task-due"
            type="datetime-local"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
