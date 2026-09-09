import type { PriorityId, StageId, TaskKindId } from "@/lib/schema";

export type Role = "admin" | "member";

export interface User {
  email: string;
  name: string;
  color: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
}

/** Публичная форма пользователя — без passwordHash, безопасно отдавать клиенту. */
export type PublicUser = User;

/** Внутреннее представление с хэшем пароля — используется только в store-слое, наружу (в API-ответы) никогда не отдаётся. */
export interface UserRecord extends User {
  passwordHash: string;
}

export interface AllowedEmail {
  email: string;
  addedBy: string;
  createdAt: string;
}

export interface NoteFolder {
  id: string;
  ownerEmail: string;
  name: string;
  createdAt: string;
}

export interface Note {
  id: string;
  ownerEmail: string;
  folderId: string | null;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface WorkspaceInvite {
  workspaceId: string;
  email: string;
  createdAt: string;
}

export interface Board {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  ownerEmail: string;
  memberEmails: string[];
  createdAt: string;
}

export interface Task {
  id: string;
  boardId: string;
  title: string;
  description: string;
  resultNote: string | null;
  createdBy: string | null;
  stage: StageId;
  priority: PriorityId;
  kind: TaskKindId;
  targetCount: number | null;
  foundCount: number | null;
  assigneeEmail: string | null;
  dueDate: string | null;
  /** Когда задача в последний раз перешла в этап «Готово» — null, если сейчас не в «Готово» или ещё ни разу не завершалась. Источник истины для недельного архивирования (см. lib/week.ts). Выставляется только на сервере, не принимается напрямую из PATCH-тела. */
  completedAt: string | null;
  /** Когда задачу убрали в архив. null — задача в обычных списках доски. Архив — обратимая альтернатива удалению: задача не показывается на доске, но не теряется. */
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskWithBoard extends Task {
  boardName: string;
}

/** Скриншот/файл, прикреплённый к задаче. `data` — содержимое в base64, отдаётся наружу только через отдельный raw-эндпоинт, не в списках. */
export interface TaskAttachment {
  id: string;
  taskId: string;
  uploadedBy: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  data: string;
  createdAt: string;
}

/** Публичные метаданные вложения — без `data`, безопасно отдавать в списках. */
export type TaskAttachmentMeta = Omit<TaskAttachment, "data">;

export interface BoardWithProgress extends Board {
  taskCount: number;
  doneCount: number;
  latestTaskAt: string | null;
}

export type QuestionStatus = "open" | "answered";

export interface Question {
  id: string;
  workspaceId: string;
  authorEmail: string | null;
  recipientEmails: string[];
  title: string;
  status: QuestionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionMessage {
  id: string;
  questionId: string;
  authorEmail: string | null;
  body: string;
  createdAt: string;
}

/** Рабочая ссылка (вкладка «Ссылки») — общий для пространства список внешних сервисов. */
export interface WorkLink {
  id: string;
  workspaceId: string;
  title: string;
  url: string;
  description: string;
  createdBy: string | null;
  createdAt: string;
}

/**
 * Привязка аккаунта к чату Telegram-бота — один чат на пользователя.
 * `notify*` — какие события слать в Telegram (по умолчанию все включены,
 * кроме отсутствующих — старые записи без этих колонок трактуются как
 * «всё включено» на уровне store-слоя). `digestHourUtc` — в какой час UTC
 * присылать ежедневную сводку (см. lib/telegram-digest.ts и cron).
 */
export interface TelegramLink {
  email: string;
  chatId: string;
  username: string | null;
  linkedAt: string;
  notifyTaskAssigned: boolean;
  notifyComments: boolean;
  notifyStageChanges: boolean;
  notifyTaskDeleted: boolean;
  notifyQuestions: boolean;
  notifyDigest: boolean;
  digestHourUtc: number;
}

export type TelegramNotifyPrefKey =
  | "notifyTaskAssigned"
  | "notifyComments"
  | "notifyStageChanges"
  | "notifyTaskDeleted"
  | "notifyQuestions"
  | "notifyDigest";

/** Одноразовый токен для диплинка `t.me/<bot>?start=<token>`, подтверждающего привязку аккаунта. */
export interface TelegramLinkToken {
  token: string;
  email: string;
  expiresAt: string;
  createdAt: string;
}

/**
 * Шаг пошагового диалога создания задачи в Telegram (`/newtask`).
 * `workspace`/`board` пропускаются, если у пользователя одно пространство
 * и/или одна доска в нём.
 */
export type TelegramDraftStep =
  | "workspace"
  | "board"
  | "title"
  | "description"
  | "kind"
  | "priority"
  | "assignee"
  | "due"
  | "calendar";

/**
 * Черновик задачи, создаваемой через бота. Живёт в хранилище, а не в памяти
 * процесса: на Vercel каждый апдейт Telegram может попасть в свой экземпляр
 * serverless-функции, и состояние диалога между шагами иначе теряется.
 * Одна активная запись на чат; протухшие (`expiresAt`) игнорируются и
 * перезаписываются при следующем /newtask.
 */
export interface TelegramDraft {
  chatId: string;
  email: string;
  step: TelegramDraftStep;
  workspaceId: string | null;
  boardId: string | null;
  title: string | null;
  description: string | null;
  kind: TaskKindId | null;
  priority: PriorityId | null;
  assigneeEmail: string | null;
  dueDate: string | null;
  /** message_id сообщения с инлайн-календарём — чтобы редактировать его, а не слать новое на каждый переход по месяцам. */
  calendarMessageId: number | null;
  /** Месяц, показанный в календаре сейчас, в формате YYYY-MM. */
  calendarMonth: string | null;
  expiresAt: string;
  updatedAt: string;
}

/**
 * OAuth-привязка личного Google-календаря пользователя — один аккаунт
 * Google на пользователя приложения. `refreshToken` используется, чтобы
 * молча получать новый `accessToken`, когда старый истёк (`expiryDate`).
 */
export interface GoogleCalendarLink {
  email: string;
  accessToken: string;
  refreshToken: string;
  /** Unix-время (мс) истечения accessToken. */
  expiryDate: number;
  connectedAt: string;
}

/** Событие Google-календаря на сегодня — то немногое, что нужно виджету. */
export interface GoogleCalendarEvent {
  id: string;
  title: string;
  /** ISO-время начала, либо просто "YYYY-MM-DD" для событий на весь день. */
  start: string;
  end: string;
  allDay: boolean;
  htmlLink: string;
}

/**
 * Комментарий или системная запись в истории задачи. `comment` — обычное
 * сообщение от пользователя (`body` заполнен); остальные типы — автолог
 * изменений полей (`fromValue`/`toValue` содержат старое/новое значение,
 * для перевода в читаемый текст — на стороне UI/бота).
 */
export type TaskEventType =
  | "comment"
  | "created"
  | "stage_changed"
  | "priority_changed"
  | "assignee_changed"
  | "due_date_changed";

export interface TaskEvent {
  id: string;
  taskId: string;
  type: TaskEventType;
  authorEmail: string | null;
  body: string | null;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
}

/** Внутриприложенческое уведомление («колокольчик») — параллельный Telegram-у канал, не требует привязки бота. */
export type NotificationType =
  | "task_assigned"
  | "task_comment"
  | "task_stage_changed"
  | "task_deleted"
  | "question_asked"
  | "question_answered"
  | "broadcast";

export interface Notification {
  id: string;
  userEmail: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Относительный путь внутри приложения, куда ведёт клик по уведомлению. */
  link: string | null;
  read: boolean;
  createdAt: string;
}

/** Одноразовый токен для самостоятельного сброса пароля через диплинк, присланный в Telegram. */
export interface PasswordResetToken {
  token: string;
  email: string;
  expiresAt: string;
  createdAt: string;
}

export type GameId = "dino" | "samurai" | "doom";

/**
 * Лучший результат пользователя в мини-игре, в рамках пространства —
 * одна запись на (workspaceId, gameId, userEmail), хранит только
 * рекорд (см. `upsertGameScore`: новый результат сохраняется, только
 * если он выше уже сохранённого). Источник данных для доски рекордов.
 */
export interface GameScore {
  id: string;
  workspaceId: string;
  gameId: GameId;
  userEmail: string;
  score: number;
  createdAt: string;
  updatedAt: string;
}

/** Запись доски рекордов — GameScore, дополненный публичными данными пользователя для отображения. */
export interface LeaderboardEntry {
  userEmail: string;
  name: string;
  color: string;
  score: number;
  updatedAt: string;
  isYou: boolean;
}
