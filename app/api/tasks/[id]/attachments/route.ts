import { NextRequest, NextResponse } from "next/server";
import { createTaskAttachmentSchema } from "@/lib/validation";
import { addTaskAttachment, countTaskAttachments, getTask, listTaskAttachments } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import type { Task, TaskAttachmentMeta } from "@/lib/models";

const MAX_ATTACHMENTS = 5;
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

/** И создатель, и исполнитель задачи могут прикреплять/удалять скриншоты. */
function canManageAttachments(task: Task, email: string): boolean {
  const isCreator = !task.createdBy || task.createdBy === email;
  const isAssignee = task.assigneeEmails.includes(email);
  return isCreator || isAssignee;
}

function toMeta({ data: _data, ...meta }: Awaited<ReturnType<typeof addTaskAttachment>>): TaskAttachmentMeta {
  return meta;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const task = await getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  }
  const attachments = await listTaskAttachments(id);
  return NextResponse.json({ attachments: attachments.map(toMeta) });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const task = await getTask(id);
  if (!task) {
    return NextResponse.json({ error: "Задача не найдена" }, { status: 404 });
  }
  if (!canManageAttachments(task, user.email)) {
    return NextResponse.json(
      { error: "Прикреплять файлы может только создатель или исполнитель задачи" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = createTaskAttachmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Некорректные данные", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const count = await countTaskAttachments(id);
  if (count >= MAX_ATTACHMENTS) {
    return NextResponse.json(
      { error: `Не больше ${MAX_ATTACHMENTS} файлов на одну задачу` },
      { status: 400 },
    );
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(parsed.data.data, "base64");
  } catch {
    return NextResponse.json({ error: "Не удалось прочитать файл" }, { status: 400 });
  }
  if (buffer.length === 0) {
    return NextResponse.json({ error: "Пустой файл" }, { status: 400 });
  }
  if (buffer.length > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `Файл больше ${MAX_SIZE_BYTES / (1024 * 1024)} МБ` },
      { status: 400 },
    );
  }

  const attachment = await addTaskAttachment({
    taskId: id,
    uploadedBy: user.email,
    filename: parsed.data.filename,
    contentType: parsed.data.contentType,
    sizeBytes: buffer.length,
    data: parsed.data.data,
  });
  return NextResponse.json({ attachment: toMeta(attachment) }, { status: 201 });
}
