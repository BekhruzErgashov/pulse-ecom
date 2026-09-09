import { z } from "zod";

const emailField = z.string().trim().toLowerCase().email("Введите корректный email");
const passwordField = z
  .string()
  .min(8, "Минимум 8 символов")
  .max(200);

export const registerSchema = z.object({
  name: z.string().min(1, "Введите имя").max(80),
  email: emailField,
  password: passwordField,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Введите пароль").max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const addAllowedEmailSchema = z.object({
  email: emailField,
});
export type AddAllowedEmailInput = z.infer<typeof addAllowedEmailSchema>;

export const updateUserSchema = z.object({
  role: z.enum(["admin", "member"]).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const createNoteFolderSchema = z.object({
  name: z.string().min(1, "Введите название папки").max(80),
});
export type CreateNoteFolderInput = z.infer<typeof createNoteFolderSchema>;

export const createNoteSchema = z.object({
  title: z.string().max(200).optional().default(""),
  body: z.string().max(50_000).optional().default(""),
  folderId: z.string().nullable().optional().default(null),
});
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const updateNoteSchema = z.object({
  title: z.string().max(200).optional(),
  body: z.string().max(50_000).optional(),
  folderId: z.string().nullable().optional(),
});
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export const createWorkspaceSchema = z.object({
  name: z.string().min(1, "Введите название пространства").max(120),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const workspaceMemberSchema = z.object({
  email: emailField,
});
export type WorkspaceMemberInput = z.infer<typeof workspaceMemberSchema>;

export const resetPasswordSchema = z.object({
  password: passwordField.optional(),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Введите текущий пароль"),
  newPassword: passwordField,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const createBoardSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1, "Введите название доски").max(120),
  description: z.string().max(400).optional().default(""),
});
export type CreateBoardInput = z.infer<typeof createBoardSchema>;

export const updateBoardSchema = z.object({
  name: z.string().min(1, "Введите название доски").max(120).optional(),
  description: z.string().max(400).optional(),
});
export type UpdateBoardInput = z.infer<typeof updateBoardSchema>;

const nullableCount = z
  .number()
  .int()
  .min(0)
  .max(1_000_000)
  .nullable()
  .optional();

export const createTaskSchema = z.object({
  boardId: z.string().min(1),
  title: z.string().min(1, "Введите название задачи").max(200),
  description: z.string().max(2000).optional().default(""),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  kind: z.enum(["normal", "hammers", "superhits"]).default("normal"),
  targetCount: nullableCount.default(null),
  foundCount: nullableCount.default(null),
  // Исполнителей может быть несколько. Одиночное assigneeEmail оставлено для
  // совместимости со старыми клиентами — сервер приводит его к массиву.
  assigneeEmails: z.array(z.string().email()).optional(),
  assigneeEmail: z.string().email().nullable().optional(),
  dueDate: z.string().nullable().optional().default(null),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  resultNote: z.string().max(2000).nullable().optional(),
  stage: z.enum(["todo", "in_progress", "review", "done"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  kind: z.enum(["normal", "hammers", "superhits"]).optional(),
  targetCount: nullableCount,
  foundCount: nullableCount,
  assigneeEmails: z.array(z.string().email()).optional(),
  assigneeEmail: z.string().email().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  /** true — убрать в архив, false — вернуть из архива. Саму метку времени проставляет сервер. */
  archived: z.boolean().optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const addMemberSchema = z.object({
  email: emailField,
});

// Скриншоты к задаче: файл передаётся как base64 (без префикса data:...),
// размер/количество проверяются отдельно в API-роуте (там доступна длина
// декодированного буфера и текущее число вложений задачи).
export const createTaskAttachmentSchema = z.object({
  filename: z.string().trim().min(1).max(200).default("screenshot.png"),
  contentType: z
    .string()
    .regex(/^image\/(png|jpe?g|gif|webp|svg\+xml)$/i, "Разрешены только изображения"),
  data: z.string().min(1, "Пустой файл"),
});
export type CreateTaskAttachmentInput = z.infer<typeof createTaskAttachmentSchema>;

export const createQuestionSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1, "Введите текст вопроса").max(2000),
  recipientEmails: z
    .array(emailField)
    .min(1, "Выберите хотя бы одного получателя")
    .max(20),
});
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

export const createMessageSchema = z.object({
  body: z.string().min(1, "Введите сообщение").max(4000),
});
export type CreateMessageInput = z.infer<typeof createMessageSchema>;

export const updateQuestionSchema = z.object({
  status: z.enum(["open", "answered"]),
});
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

const linkUrlField = z
  .string()
  .trim()
  .min(1, "Введите ссылку")
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "Введите корректную ссылку (начинается с http:// или https://)");

export const createTaskEventSchema = z.object({
  body: z.string().trim().min(1, "Введите комментарий").max(2000),
});
export type CreateTaskEventInput = z.infer<typeof createTaskEventSchema>;

export const createWorkLinkSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().trim().min(1, "Введите название").max(120),
  url: linkUrlField,
  description: z.string().trim().max(300).optional().default(""),
});
export type CreateWorkLinkInput = z.infer<typeof createWorkLinkSchema>;

export const submitGameScoreSchema = z.object({
  workspaceId: z.string().min(1),
  gameId: z.enum(["dino", "samurai", "doom"]),
  score: z.number().int().min(0).max(10_000_000),
});
export type SubmitGameScoreInput = z.infer<typeof submitGameScoreSchema>;

/**
 * Приводит две формы поля исполнителя к одному массиву: новый клиент шлёт
 * assigneeEmails, старый — одиночный assigneeEmail. Возвращает undefined,
 * если исполнителей в запросе нет вовсе (значит, поле не меняется).
 */
export function normalizeAssignees(input: {
  assigneeEmails?: string[];
  assigneeEmail?: string | null;
}): string[] | undefined {
  if (input.assigneeEmails) {
    return Array.from(new Set(input.assigneeEmails.map((e) => e.toLowerCase())));
  }
  if (input.assigneeEmail !== undefined) {
    return input.assigneeEmail ? [input.assigneeEmail.toLowerCase()] : [];
  }
  return undefined;
}
