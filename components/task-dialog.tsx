"use client";

import * as React from "react";
import { toast } from "sonner";
import {
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PRIORITIES, STAGES, TASK_KINDS } from "@/lib/schema";
import { createTaskSchema, updateTaskSchema } from "@/lib/validation";
import { isOverdue as checkOverdue } from "@/lib/task-sort";
import { linkifyText } from "@/lib/linkify";
import type { Task, TaskAttachmentMeta, TaskEvent, User } from "@/lib/models";
import { cn } from "@/lib/utils";

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
}: TaskDialogProps) {
  const isEdit = Boolean(task);
  // Создатель (или если создатель не известен/удалён — доступно всем
  // с доступом к доске) видит кнопку редактирования полей задачи.
  const canFullyEdit = !task || !task.createdBy || task.createdBy === currentUserEmail;
  // Комментарий исполнителя редактирует только сам исполнитель.
  const canEditComment = Boolean(task && task.assigneeEmail && task.assigneeEmail === currentUserEmail);
  // Скриншоты может прикреплять и создатель, и исполнитель задачи.
  const canManageAttachments = canFullyEdit || canEditComment;

  const [mode, setMode] = React.useState<"view" | "edit">(isEdit ? "view" : "edit");

  const [title, setTitle] = React.useState(task?.title ?? "");
  const [description, setDescription] = React.useState(task?.description ?? "");
  const [priority, setPriority] = React.useState<Task["priority"]>(task?.priority ?? "medium");
  const [stage, setStage] = React.useState<Task["stage"]>(task?.stage ?? defaultStage ?? "todo");
  const [kind, setKind] = React.useState<Task["kind"]>(task?.kind ?? "normal");
  const [targetCount, setTargetCount] = React.useState(
    task?.targetCount != null ? String(task.targetCount) : "",
  );
  const [foundCount, setFoundCount] = React.useState(
    task?.foundCount != null ? String(task.foundCount) : "",
  );
  const [assigneeEmail, setAssigneeEmail] = React.useState(task?.assigneeEmail ?? "");
  const [dueDate, setDueDate] = React.useState(isoToLocalInput(task?.dueDate ?? null));
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  // Отдельное состояние для быстрого сохранения этапа/комментария из
  // режима просмотра — не завязано на полную форму редактирования.
  const [quickStage, setQuickStage] = React.useState<Task["stage"]>(task?.stage ?? "todo");
  const [quickComment, setQuickComment] = React.useState(task?.resultNote ?? "");
  const [quickFoundCount, setQuickFoundCount] = React.useState(
    task?.foundCount != null ? String(task.foundCount) : "0",
  );
  const [quickPending, setQuickPending] = React.useState(false);

  const [attachments, setAttachments] = React.useState<TaskAttachmentMeta[]>([]);
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

  async function uploadAttachments(files: File[] | FileList) {
    if (!task) return;
    const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return;
    setUploadPending(true);
    try {
      for (const file of images) {
        if (attachments.length >= MAX_ATTACHMENTS) {
          toast.error(`Не больше ${MAX_ATTACHMENTS} файлов на задачу`);
          break;
        }
        if (file.size > MAX_ATTACHMENT_SIZE) {
          toast.error(`Файл «${file.name}» больше 5 МБ`);
          continue;
        }
        const data = await fileToBase64(file);
        const res = await fetch(`/api/tasks/${task.id}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name || "screenshot.png",
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
      setKind(task?.kind ?? "normal");
      setTargetCount(task?.targetCount != null ? String(task.targetCount) : "");
      setFoundCount(task?.foundCount != null ? String(task.foundCount) : "");
      setAssigneeEmail(task?.assigneeEmail ?? "");
      setDueDate(isoToLocalInput(task?.dueDate ?? null));
      setQuickStage(task?.stage ?? "todo");
      setQuickComment(task?.resultNote ?? "");
      setQuickFoundCount(task?.foundCount != null ? String(task.foundCount) : "0");
      setError(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, defaultStage]);

  const isPromo = kind !== "normal";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    try {
      const commonFields = {
        title,
        description,
        priority,
        kind,
        targetCount: isPromo && targetCount !== "" ? Number(targetCount) : null,
        foundCount: isPromo && foundCount !== "" ? Number(foundCount) : null,
        assigneeEmail: assigneeEmail || null,
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
        onCreated?.(data.task);
        toast.success("Задача создана");
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

  async function handleQuickSave() {
    if (!task) return;
    setQuickPending(true);
    try {
      const patch: Record<string, unknown> = {};
      if (quickStage !== task.stage) patch.stage = quickStage;
      if (canEditComment && quickComment !== (task.resultNote ?? "")) {
        patch.resultNote = quickComment || null;
      }
      if (
        canEditComment &&
        isPromo &&
        Number(quickFoundCount || 0) !== (task.foundCount ?? 0)
      ) {
        patch.foundCount = quickFoundCount === "" ? 0 : Number(quickFoundCount);
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

  if (!task) {
    // Создание новой задачи — сразу форма, режима просмотра ещё нет.
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Новая задача</DialogTitle>
          </DialogHeader>
          <TaskForm
            title={title}
            setTitle={setTitle}
            description={description}
            setDescription={setDescription}
            kind={kind}
            setKind={setKind}
            isPromo={isPromo}
            targetCount={targetCount}
            setTargetCount={setTargetCount}
            foundCount={foundCount}
            setFoundCount={setFoundCount}
            priority={priority}
            setPriority={setPriority}
            assigneeEmail={assigneeEmail}
            setAssigneeEmail={setAssigneeEmail}
            dueDate={dueDate}
            setDueDate={setDueDate}
            members={members}
            error={error}
            showStage={false}
            stage={stage}
            setStage={setStage}
          />
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
  const assignee = members.find((m) => m.email === task.assigneeEmail);
  const overdue = checkOverdue(task);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {mode === "view" ? (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-3">
                <DialogTitle className="flex items-center gap-1.5">
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
                {isPromo && (
                  <Badge variant="outline">{TASK_KINDS.find((k) => k.id === task.kind)?.label}</Badge>
                )}
              </div>

              {isPromo && (canEditComment || task.targetCount != null) && (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-xs text-[var(--color-ink-soft)]">
                    <span>Прогресс</span>
                    {canEditComment ? (
                      <span className="flex items-center gap-1.5 font-mono">
                        <Input
                          type="number"
                          min={0}
                          value={quickFoundCount}
                          onChange={(e) => setQuickFoundCount(e.target.value)}
                          className="h-6 w-16 px-1.5 py-0 text-right"
                          aria-label="Найдено, шт."
                        />
                        {task.targetCount != null ? ` / ${task.targetCount}` : ""}
                      </span>
                    ) : (
                      <span className="font-mono">
                        {task.foundCount ?? 0}
                        {task.targetCount != null ? ` / ${task.targetCount}` : ""}
                      </span>
                    )}
                  </div>
                  {task.targetCount != null && (
                    <Progress
                      value={Math.min(
                        100,
                        Math.round(
                          ((canEditComment ? Number(quickFoundCount || 0) : task.foundCount ?? 0) /
                            task.targetCount) *
                            100,
                        ),
                      )}
                    />
                  )}
                  {canEditComment && (
                    <p className="text-xs text-[var(--color-ink-soft)]">
                      Обновите количество и нажмите «Сохранить» внизу.
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="mb-1 text-xs text-[var(--color-ink-soft)]">Исполнитель</p>
                  {assignee ? (
                    <div className="flex items-center gap-2">
                      <Avatar name={assignee.name} color={assignee.color} size="sm" />
                      <span>{assignee.name}</span>
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

              <div className="flex flex-col gap-2 border-t border-[var(--color-line)] pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-[var(--color-ink-soft)]">
                    Скриншоты {attachments.length > 0 && `(${attachments.length}/${MAX_ATTACHMENTS})`}
                  </p>
                  {canManageAttachments && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadPending || attachments.length >= MAX_ATTACHMENTS}
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
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) void uploadAttachments(e.target.files);
                    e.target.value = "";
                  }}
                />
                {attachmentsLoading ? (
                  <p className="text-xs text-[var(--color-ink-soft)]">Загрузка…</p>
                ) : attachments.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((a) => (
                      <div key={a.id} className="group relative">
                        <a
                          href={`/api/tasks/${task.id}/attachments/${a.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`${a.filename} · ${formatFileSize(a.sizeBytes)}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`/api/tasks/${task.id}/attachments/${a.id}`}
                            alt={a.filename}
                            className="h-20 w-20 rounded-(--radius-control) border border-[var(--color-line)] object-cover"
                          />
                        </a>
                        {(canManageAttachments || a.uploadedBy === currentUserEmail) && (
                          <button
                            type="button"
                            onClick={() => handleDeleteAttachment(a.id)}
                            aria-label="Удалить скриншот"
                            className="absolute -right-1.5 -top-1.5 hidden size-5 items-center justify-center rounded-full bg-[var(--color-danger)] text-[var(--color-on-accent)] group-hover:flex"
                          >
                            <X className="size-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  canManageAttachments && (
                    <p className="text-xs text-[var(--color-ink-soft)]">
                      Вставьте скриншот из буфера обмена (Ctrl+V) или нажмите «Прикрепить».
                    </p>
                  )
                )}
              </div>

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
                    {assignee
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
              {canFullyEdit ? (
                <Button type="button" variant="ghost" onClick={() => setMode("edit")}>
                  <Pencil className="size-3.5" /> Редактировать
                </Button>
              ) : (
                <span />
              )}
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
              kind={kind}
              setKind={setKind}
              isPromo={isPromo}
              targetCount={targetCount}
              setTargetCount={setTargetCount}
              foundCount={foundCount}
              setFoundCount={setFoundCount}
              priority={priority}
              setPriority={setPriority}
              assigneeEmail={assigneeEmail}
              setAssigneeEmail={setAssigneeEmail}
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
                  onClick={handleDelete}
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
  kind,
  setKind,
  isPromo,
  targetCount,
  setTargetCount,
  foundCount,
  setFoundCount,
  priority,
  setPriority,
  assigneeEmail,
  setAssigneeEmail,
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
  kind: Task["kind"];
  setKind: (v: Task["kind"]) => void;
  isPromo: boolean;
  targetCount: string;
  setTargetCount: (v: string) => void;
  foundCount: string;
  setFoundCount: (v: string) => void;
  priority: Task["priority"];
  setPriority: (v: Task["priority"]) => void;
  assigneeEmail: string;
  setAssigneeEmail: (v: string) => void;
  dueDate: string;
  setDueDate: (v: string) => void;
  members: User[];
  error: string | undefined;
  showStage: boolean;
  stage: Task["stage"];
  setStage: (v: Task["stage"]) => void;
}) {
  const promoLabel = TASK_KINDS.find((k) => k.id === kind)?.label ?? "";

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

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="task-kind">Вид задачи</Label>
        <Select id="task-kind" value={kind} onChange={(e) => setKind(e.target.value as Task["kind"])}>
          {TASK_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </Select>
      </div>

      {isPromo && (
        <div className="grid grid-cols-2 gap-4 rounded-(--radius-card) border border-[var(--color-line)] p-3">
          <div className="col-span-2 -mt-1 text-xs text-[var(--color-ink-soft)]">
            Акционная задача «{promoLabel}»: задайте план и вносите факт по мере находок.
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-target">Таргет (план), шт.</Label>
            <Input
              id="task-target"
              type="number"
              min={0}
              value={targetCount}
              onChange={(e) => setTargetCount(e.target.value)}
              placeholder="Например, 50"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="task-found">Найдено, шт.</Label>
            <Input
              id="task-found"
              type="number"
              min={0}
              value={foundCount}
              onChange={(e) => setFoundCount(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>
      )}

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
          <Label htmlFor="task-assignee">Исполнитель</Label>
          <Select
            id="task-assignee"
            value={assigneeEmail}
            onChange={(e) => setAssigneeEmail(e.target.value)}
          >
            <option value="">Не назначен</option>
            {members.map((m) => (
              <option key={m.email} value={m.email}>
                {m.name}
              </option>
            ))}
          </Select>
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
