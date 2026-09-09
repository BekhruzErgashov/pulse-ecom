import { NextRequest, NextResponse } from "next/server";
import { deleteTaskAttachment, getTask, getTaskAttachment } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import type { Task } from "@/lib/models";

function canManageAttachments(task: Task, email: string): boolean {
  const isCreator = !task.createdBy || task.createdBy === email;
  const isAssignee = task.assigneeEmails.includes(email);
  return isCreator || isAssignee;
}

/** Отдаёт сам файл (не JSON) — используется как src у <img>, авторизация через ту же сессионную куку. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id, attachmentId } = await params;
  const attachment = await getTaskAttachment(attachmentId);
  if (!attachment || attachment.taskId !== id) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }
  const buffer = Buffer.from(attachment.data, "base64");
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": attachment.contentType,
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id, attachmentId } = await params;
  const task = await getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  }
  const attachment = await getTaskAttachment(attachmentId);
  if (!attachment || attachment.taskId !== id) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 404 });
  }
  const isUploader = attachment.uploadedBy === user.email;
  if (!canManageAttachments(task, user.email) && !isUploader) {
    return NextResponse.json(
      { error: "Удалить файл может только создатель, исполнитель задачи или тот, кто его загрузил" },
      { status: 403 },
    );
  }
  await deleteTaskAttachment(attachmentId);
  return NextResponse.json({ ok: true });
}
