import "server-only";
import { hashPassword, verifyPassword } from "@/lib/password";
import type {
  AllowedEmail,
  Board,
  Note,
  NoteFolder,
  Question,
  QuestionMessage,
  QuestionStatus,
  Task,
  TaskAttachment,
  TaskWithBoard,
  User,
  UserRecord,
  Workspace,
  WorkLink,
  TelegramLink,
  TelegramLinkToken,
  TelegramNotifyPrefKey,
  TelegramDraft,
  TelegramDraftStep,
  GoogleCalendarLink,
  TaskEvent,
  TaskEventType,
  Notification,
  NotificationType,
  PasswordResetToken,
  GameScore,
  GameId,
} from "@/lib/models";

interface Store {
  allowedEmails: Map<string, AllowedEmail>;
  users: Map<string, UserRecord>;
  workspaces: Map<string, Workspace>;
  workspaceMembers: Map<string, Set<string>>; // workspaceId -> emails
  workspaceInvites: Map<string, Set<string>>; // workspaceId -> pending (unregistered) emails
  boards: Map<string, Board>;
  tasks: Map<string, Task>;
  taskAttachments: Map<string, TaskAttachment>;
  questions: Map<string, Question>;
  messages: Map<string, QuestionMessage>;
  noteFolders: Map<string, NoteFolder>;
  notes: Map<string, Note>;
  workLinks: Map<string, WorkLink>;
  telegramLinks: Map<string, TelegramLink>; // email -> link
  telegramLinkTokens: Map<string, TelegramLinkToken>; // token -> token record
  telegramDrafts: Map<string, TelegramDraft>; // chatId -> черновик задачи из /newtask
  googleCalendarLinks: Map<string, GoogleCalendarLink>; // email -> link
  taskEvents: Map<string, TaskEvent>;
  notifications: Map<string, Notification>;
  passwordResetTokens: Map<string, PasswordResetToken>;
  gameScores: Map<string, GameScore>;
  seeded: boolean;
}

const globalForStore = globalThis as unknown as { __ttt_store?: Store };

function createStore(): Store {
  return {
    allowedEmails: new Map(),
    users: new Map(),
    workspaces: new Map(),
    workspaceMembers: new Map(),
    workspaceInvites: new Map(),
    boards: new Map(),
    tasks: new Map(),
    taskAttachments: new Map(),
    questions: new Map(),
    messages: new Map(),
    noteFolders: new Map(),
    notes: new Map(),
    workLinks: new Map(),
    telegramLinks: new Map(),
    telegramLinkTokens: new Map(),
    telegramDrafts: new Map(),
    googleCalendarLinks: new Map(),
    taskEvents: new Map(),
    notifications: new Map(),
    passwordResetTokens: new Map(),
    gameScores: new Map(),
    seeded: false,
  };
}

export const store: Store = globalForStore.__ttt_store ?? createStore();
globalForStore.__ttt_store = store;

const AVATAR_COLORS = ["#2451B3", "#2E9E6C", "#C9852A", "#7C5CBF", "#C34D4D", "#1F8C99"];

function colorForEmail(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = (hash * 31 + email.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function toPublicUser(record: UserRecord): User {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _passwordHash, ...publicUser } = record;
  return publicUser;
}

// ---------- Allowlist ----------

export async function isEmailAllowed(email: string): Promise<boolean> {
  return store.allowedEmails.has(email.trim().toLowerCase());
}

export async function listAllowedEmails(): Promise<AllowedEmail[]> {
  return Array.from(store.allowedEmails.values()).sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
}

export async function addAllowedEmail(email: string, addedBy: string): Promise<AllowedEmail> {
  const normalized = email.trim().toLowerCase();
  const existing = store.allowedEmails.get(normalized);
  if (existing) return existing;
  const entry: AllowedEmail = { email: normalized, addedBy, createdAt: new Date().toISOString() };
  store.allowedEmails.set(normalized, entry);
  return entry;
}

export async function removeAllowedEmail(email: string): Promise<void> {
  store.allowedEmails.delete(email.trim().toLowerCase());
}

// ---------- Users / auth ----------

export async function registerUser(input: {
  email: string;
  name: string;
  password: string;
}): Promise<{ user: User } | { error: "not_allowed" | "already_exists" }> {
  const normalized = input.email.trim().toLowerCase();
  if (!(await isEmailAllowed(normalized))) {
    return { error: "not_allowed" };
  }
  if (store.users.has(normalized)) {
    return { error: "already_exists" };
  }
  const isFirstUser = store.users.size === 0;
  const passwordHash = await hashPassword(input.password);
  const record: UserRecord = {
    email: normalized,
    name: input.name.trim() || normalized.split("@")[0],
    color: colorForEmail(normalized),
    role: isFirstUser ? "admin" : "member",
    isActive: true,
    createdAt: new Date().toISOString(),
    passwordHash,
  };
  store.users.set(normalized, record);

  const pendingWorkspaces: string[] = [];
  for (const [workspaceId, emails] of store.workspaceInvites.entries()) {
    if (emails.has(normalized)) {
      pendingWorkspaces.push(workspaceId);
      emails.delete(normalized);
    }
  }
  for (const workspaceId of pendingWorkspaces) {
    await addWorkspaceMember(workspaceId, normalized);
  }

  return { user: toPublicUser(record) };
}

export async function verifyLogin(
  email: string,
  password: string,
): Promise<User | null> {
  const record = store.users.get(email.trim().toLowerCase());
  if (!record || !record.isActive) return null;
  const ok = await verifyPassword(password, record.passwordHash);
  if (!ok) return null;
  return toPublicUser(record);
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const record = store.users.get(email.trim().toLowerCase());
  return record ? toPublicUser(record) : undefined;
}

export async function listUsers(): Promise<User[]> {
  return Array.from(store.users.values())
    .map(toPublicUser)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export async function updateUser(
  email: string,
  patch: Partial<Pick<User, "role" | "isActive">>,
): Promise<User | undefined> {
  const record = store.users.get(email.trim().toLowerCase());
  if (!record) return undefined;
  Object.assign(record, patch);
  return toPublicUser(record);
}

export async function countAdmins(): Promise<number> {
  return Array.from(store.users.values()).filter((u) => u.role === "admin" && u.isActive).length;
}

export async function resetUserPassword(email: string, newPassword: string): Promise<boolean> {
  const record = store.users.get(email.trim().toLowerCase());
  if (!record) return false;
  record.passwordHash = await hashPassword(newPassword);
  return true;
}

export async function changeOwnPassword(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<boolean> {
  const record = store.users.get(email.trim().toLowerCase());
  if (!record) return false;
  const ok = await verifyPassword(currentPassword, record.passwordHash);
  if (!ok) return false;
  record.passwordHash = await hashPassword(newPassword);
  return true;
}

export async function deleteUser(
  email: string,
): Promise<{ ok: true } | { error: "owns_workspaces" | "owns_boards" | "not_found" }> {
  const normalized = email.trim().toLowerCase();
  if (!store.users.has(normalized)) return { error: "not_found" };

  const ownsWorkspace = Array.from(store.workspaces.values()).some(
    (w) => w.createdBy === normalized,
  );
  if (ownsWorkspace) return { error: "owns_workspaces" };

  const ownsBoard = Array.from(store.boards.values()).some((b) => b.ownerEmail === normalized);
  if (ownsBoard) return { error: "owns_boards" };

  for (const task of store.tasks.values()) {
    if (task.assigneeEmail === normalized) task.assigneeEmail = null;
    if (task.createdBy === normalized) task.createdBy = null;
  }
  for (const question of store.questions.values()) {
    if (question.authorEmail === normalized) question.authorEmail = null;
    question.recipientEmails = question.recipientEmails.filter((e) => e !== normalized);
  }
  for (const message of store.messages.values()) {
    if (message.authorEmail === normalized) message.authorEmail = null;
  }
  for (const board of store.boards.values()) {
    board.memberEmails = board.memberEmails.filter((e) => e !== normalized);
  }
  for (const members of store.workspaceMembers.values()) {
    members.delete(normalized);
  }
  store.allowedEmails.delete(normalized);
  store.users.delete(normalized);

  return { ok: true };
}

// ---------- Workspaces ----------

export async function createWorkspace(input: {
  name: string;
  createdBy: string;
}): Promise<Workspace> {
  const workspace: Workspace = {
    id: id("ws"),
    name: input.name,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
  };
  store.workspaces.set(workspace.id, workspace);
  store.workspaceMembers.set(workspace.id, new Set([input.createdBy]));
  return workspace;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  return Array.from(store.workspaces.values()).sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : 1,
  );
}

export async function listWorkspacesForUser(email: string): Promise<Workspace[]> {
  const all = await listWorkspaces();
  return all.filter((w) => store.workspaceMembers.get(w.id)?.has(email));
}

export async function getWorkspace(workspaceId: string): Promise<Workspace | undefined> {
  return store.workspaces.get(workspaceId);
}

export async function isWorkspaceMember(workspaceId: string, email: string): Promise<boolean> {
  return store.workspaceMembers.get(workspaceId)?.has(email) ?? false;
}

export async function listWorkspaceMemberEmails(workspaceId: string): Promise<string[]> {
  return Array.from(store.workspaceMembers.get(workspaceId) ?? []);
}

export async function addWorkspaceMember(workspaceId: string, email: string): Promise<void> {
  const set = store.workspaceMembers.get(workspaceId) ?? new Set<string>();
  set.add(email);
  store.workspaceMembers.set(workspaceId, set);
}

export async function removeWorkspaceMember(workspaceId: string, email: string): Promise<void> {
  store.workspaceMembers.get(workspaceId)?.delete(email);
}

export async function inviteWorkspaceMember(
  workspaceId: string,
  email: string,
): Promise<"added" | "pending"> {
  const normalized = email.trim().toLowerCase();
  if (store.users.has(normalized)) {
    await addWorkspaceMember(workspaceId, normalized);
    return "added";
  }
  const set = store.workspaceInvites.get(workspaceId) ?? new Set<string>();
  set.add(normalized);
  store.workspaceInvites.set(workspaceId, set);
  return "pending";
}

export async function listPendingInvites(workspaceId: string): Promise<string[]> {
  return Array.from(store.workspaceInvites.get(workspaceId) ?? []);
}

export async function removePendingInvite(workspaceId: string, email: string): Promise<void> {
  store.workspaceInvites.get(workspaceId)?.delete(email.trim().toLowerCase());
}

// ---------- Boards ----------

export async function createBoard(input: {
  workspaceId: string;
  name: string;
  description: string;
  ownerEmail: string;
}): Promise<Board> {
  const board: Board = {
    id: id("board"),
    workspaceId: input.workspaceId,
    name: input.name,
    description: input.description,
    ownerEmail: input.ownerEmail,
    memberEmails: [input.ownerEmail],
    createdAt: new Date().toISOString(),
  };
  store.boards.set(board.id, board);
  return board;
}

export async function listBoards(workspaceId: string): Promise<Board[]> {
  return Array.from(store.boards.values())
    .filter((b) => b.workspaceId === workspaceId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function listMyTasksInWorkspace(
  workspaceId: string,
  email: string,
): Promise<TaskWithBoard[]> {
  const boardsInWorkspace = Array.from(store.boards.values()).filter(
    (b) => b.workspaceId === workspaceId,
  );
  const boardNameById = new Map(boardsInWorkspace.map((b) => [b.id, b.name]));
  return Array.from(store.tasks.values())
    .filter((t) => boardNameById.has(t.boardId) && t.assigneeEmail === email)
    .map((t) => ({ ...t, boardName: boardNameById.get(t.boardId)! }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

/** Задачи, которые пользователь поставил сам (он автор) — зеркало listMyTasksInWorkspace, где он исполнитель. */
export async function listTasksCreatedByInWorkspace(
  workspaceId: string,
  email: string,
): Promise<TaskWithBoard[]> {
  const boardsInWorkspace = Array.from(store.boards.values()).filter(
    (b) => b.workspaceId === workspaceId,
  );
  const boardNameById = new Map(boardsInWorkspace.map((b) => [b.id, b.name]));
  return Array.from(store.tasks.values())
    .filter((t) => boardNameById.has(t.boardId) && t.createdBy === email)
    .map((t) => ({ ...t, boardName: boardNameById.get(t.boardId)! }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getBoard(boardId: string): Promise<Board | undefined> {
  return store.boards.get(boardId);
}

export async function deleteBoard(boardId: string): Promise<void> {
  store.boards.delete(boardId);
  for (const task of Array.from(store.tasks.values())) {
    if (task.boardId === boardId) store.tasks.delete(task.id);
  }
}

export async function addBoardMember(boardId: string, email: string): Promise<Board | undefined> {
  const board = store.boards.get(boardId);
  if (!board) return undefined;
  if (!board.memberEmails.includes(email)) {
    board.memberEmails.push(email);
  }
  return board;
}

export async function updateBoard(
  boardId: string,
  patch: Partial<Pick<Board, "name" | "description">>,
): Promise<Board | undefined> {
  const board = store.boards.get(boardId);
  if (!board) return undefined;
  Object.assign(board, patch);
  return board;
}

// ---------- Tasks ----------

export async function createTask(input: {
  boardId: string;
  title: string;
  description: string;
  priority: Task["priority"];
  kind?: Task["kind"];
  targetCount?: number | null;
  foundCount?: number | null;
  assigneeEmail: string | null;
  dueDate: string | null;
  createdBy?: string | null;
}): Promise<Task> {
  const now = new Date().toISOString();
  const task: Task = {
    id: id("task"),
    boardId: input.boardId,
    title: input.title,
    description: input.description,
    resultNote: null,
    createdBy: input.createdBy ?? null,
    stage: "todo",
    priority: input.priority,
    kind: input.kind ?? "normal",
    targetCount: input.targetCount ?? null,
    foundCount: input.foundCount ?? null,
    assigneeEmail: input.assigneeEmail,
    dueDate: input.dueDate,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  store.tasks.set(task.id, task);
  return task;
}

export async function listTasksByBoard(boardId: string): Promise<Task[]> {
  return Array.from(store.tasks.values())
    .filter((t) => t.boardId === boardId)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export async function getTask(taskId: string): Promise<Task | undefined> {
  return store.tasks.get(taskId);
}

export async function updateTask(
  taskId: string,
  patch: Partial<
    Pick<
      Task,
      | "title"
      | "description"
      | "resultNote"
      | "stage"
      | "priority"
      | "kind"
      | "targetCount"
      | "foundCount"
      | "assigneeEmail"
      | "dueDate"
      | "completedAt"
    >
  >,
): Promise<Task | undefined> {
  const task = store.tasks.get(taskId);
  if (!task) return undefined;
  Object.assign(task, patch, { updatedAt: new Date().toISOString() });
  return task;
}

export async function deleteTask(taskId: string): Promise<void> {
  store.tasks.delete(taskId);
  for (const attachment of Array.from(store.taskAttachments.values())) {
    if (attachment.taskId === taskId) store.taskAttachments.delete(attachment.id);
  }
  for (const event of Array.from(store.taskEvents.values())) {
    if (event.taskId === taskId) store.taskEvents.delete(event.id);
  }
}

// ---------- Task events (комментарии + автолог изменений) ----------

export async function createTaskEvent(input: {
  taskId: string;
  type: TaskEventType;
  authorEmail: string | null;
  body?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
}): Promise<TaskEvent> {
  const event: TaskEvent = {
    id: id("tevt"),
    taskId: input.taskId,
    type: input.type,
    authorEmail: input.authorEmail ?? null,
    body: input.body ?? null,
    fromValue: input.fromValue ?? null,
    toValue: input.toValue ?? null,
    createdAt: new Date().toISOString(),
  };
  store.taskEvents.set(event.id, event);
  return event;
}

export async function listTaskEvents(taskId: string): Promise<TaskEvent[]> {
  return Array.from(store.taskEvents.values())
    .filter((e) => e.taskId === taskId)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

// ---------- Notifications (внутриприложенческий «колокольчик») ----------

export async function createNotification(input: {
  userEmail: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
}): Promise<Notification> {
  const notification: Notification = {
    id: id("notif"),
    userEmail: input.userEmail,
    type: input.type,
    title: input.title,
    body: input.body,
    link: input.link ?? null,
    read: false,
    createdAt: new Date().toISOString(),
  };
  store.notifications.set(notification.id, notification);
  return notification;
}

export async function listNotifications(userEmail: string, limit = 30): Promise<Notification[]> {
  return Array.from(store.notifications.values())
    .filter((n) => n.userEmail === userEmail)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, limit);
}

export async function countUnreadNotifications(userEmail: string): Promise<number> {
  return Array.from(store.notifications.values()).filter((n) => n.userEmail === userEmail && !n.read)
    .length;
}

export async function markNotificationRead(id_: string, userEmail: string): Promise<void> {
  const n = store.notifications.get(id_);
  if (n && n.userEmail === userEmail) n.read = true;
}

export async function markAllNotificationsRead(userEmail: string): Promise<void> {
  for (const n of Array.from(store.notifications.values())) {
    if (n.userEmail === userEmail) n.read = true;
  }
}

// ---------- Task attachments (скриншоты) ----------

export async function addTaskAttachment(input: {
  taskId: string;
  uploadedBy: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  data: string;
}): Promise<TaskAttachment> {
  const attachment: TaskAttachment = {
    id: id("attachment"),
    taskId: input.taskId,
    uploadedBy: input.uploadedBy,
    filename: input.filename,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    data: input.data,
    createdAt: new Date().toISOString(),
  };
  store.taskAttachments.set(attachment.id, attachment);
  return attachment;
}

export async function listTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  return Array.from(store.taskAttachments.values())
    .filter((a) => a.taskId === taskId)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export async function countTaskAttachments(taskId: string): Promise<number> {
  let count = 0;
  for (const a of store.taskAttachments.values()) {
    if (a.taskId === taskId) count++;
  }
  return count;
}

export async function getTaskAttachment(attachmentId: string): Promise<TaskAttachment | undefined> {
  return store.taskAttachments.get(attachmentId);
}

export async function deleteTaskAttachment(attachmentId: string): Promise<void> {
  store.taskAttachments.delete(attachmentId);
}

// ---------- Questions ----------

export async function createQuestion(input: {
  workspaceId: string;
  authorEmail: string;
  recipientEmails: string[];
  title: string;
}): Promise<Question> {
  const now = new Date().toISOString();
  const question: Question = {
    id: id("q"),
    workspaceId: input.workspaceId,
    authorEmail: input.authorEmail,
    recipientEmails: Array.from(new Set(input.recipientEmails)),
    title: input.title,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
  store.questions.set(question.id, question);
  return question;
}

export async function listQuestionsForUser(
  workspaceId: string,
  email: string,
): Promise<Question[]> {
  return Array.from(store.questions.values())
    .filter(
      (q) =>
        q.workspaceId === workspaceId &&
        (q.authorEmail === email || q.recipientEmails.includes(email)),
    )
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getQuestion(questionId: string): Promise<Question | undefined> {
  return store.questions.get(questionId);
}

export async function updateQuestionStatus(
  questionId: string,
  status: QuestionStatus,
): Promise<Question | undefined> {
  const question = store.questions.get(questionId);
  if (!question) return undefined;
  question.status = status;
  question.updatedAt = new Date().toISOString();
  return question;
}

export async function createMessage(input: {
  questionId: string;
  authorEmail: string;
  body: string;
}): Promise<QuestionMessage> {
  const message: QuestionMessage = {
    id: id("msg"),
    questionId: input.questionId,
    authorEmail: input.authorEmail,
    body: input.body,
    createdAt: new Date().toISOString(),
  };
  store.messages.set(message.id, message);
  const question = store.questions.get(input.questionId);
  if (question) question.updatedAt = message.createdAt;
  return message;
}

export async function listMessages(questionId: string): Promise<QuestionMessage[]> {
  return Array.from(store.messages.values())
    .filter((m) => m.questionId === questionId)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

// ---------- Notes (личные, видны только владельцу) ----------

export async function createNoteFolder(input: {
  ownerEmail: string;
  name: string;
}): Promise<NoteFolder> {
  const folder: NoteFolder = {
    id: id("folder"),
    ownerEmail: input.ownerEmail,
    name: input.name,
    createdAt: new Date().toISOString(),
  };
  store.noteFolders.set(folder.id, folder);
  return folder;
}

export async function listNoteFolders(ownerEmail: string): Promise<NoteFolder[]> {
  return Array.from(store.noteFolders.values())
    .filter((f) => f.ownerEmail === ownerEmail)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

export async function deleteNoteFolder(ownerEmail: string, folderId: string): Promise<void> {
  const folder = store.noteFolders.get(folderId);
  if (!folder || folder.ownerEmail !== ownerEmail) return;
  for (const note of store.notes.values()) {
    if (note.folderId === folderId && note.ownerEmail === ownerEmail) {
      note.folderId = null;
    }
  }
  store.noteFolders.delete(folderId);
}

export async function createNote(input: {
  ownerEmail: string;
  title: string;
  body: string;
  folderId: string | null;
}): Promise<Note> {
  const now = new Date().toISOString();
  const note: Note = {
    id: id("note"),
    ownerEmail: input.ownerEmail,
    folderId: input.folderId,
    title: input.title,
    body: input.body,
    createdAt: now,
    updatedAt: now,
  };
  store.notes.set(note.id, note);
  return note;
}

export async function listNotes(ownerEmail: string): Promise<Note[]> {
  return Array.from(store.notes.values())
    .filter((n) => n.ownerEmail === ownerEmail)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getNote(ownerEmail: string, noteId: string): Promise<Note | undefined> {
  const note = store.notes.get(noteId);
  return note && note.ownerEmail === ownerEmail ? note : undefined;
}

export async function updateNote(
  ownerEmail: string,
  noteId: string,
  patch: Partial<Pick<Note, "title" | "body" | "folderId">>,
): Promise<Note | undefined> {
  const note = store.notes.get(noteId);
  if (!note || note.ownerEmail !== ownerEmail) return undefined;
  Object.assign(note, patch, { updatedAt: new Date().toISOString() });
  return note;
}

export async function deleteNote(ownerEmail: string, noteId: string): Promise<void> {
  const note = store.notes.get(noteId);
  if (!note || note.ownerEmail !== ownerEmail) return;
  store.notes.delete(noteId);
}

// ---------- Work links (рабочие ссылки, общие для пространства) ----------

export async function createWorkLink(input: {
  workspaceId: string;
  title: string;
  url: string;
  description: string;
  createdBy: string | null;
}): Promise<WorkLink> {
  const link: WorkLink = {
    id: id("link"),
    workspaceId: input.workspaceId,
    title: input.title,
    url: input.url,
    description: input.description,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
  };
  store.workLinks.set(link.id, link);
  return link;
}

export async function listWorkLinks(workspaceId: string): Promise<WorkLink[]> {
  return Array.from(store.workLinks.values())
    .filter((l) => l.workspaceId === workspaceId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getWorkLink(linkId: string): Promise<WorkLink | undefined> {
  return store.workLinks.get(linkId);
}

export async function deleteWorkLink(linkId: string): Promise<void> {
  store.workLinks.delete(linkId);
}

// ---------- Telegram (привязка аккаунта к боту) ----------

const TELEGRAM_LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

export async function createTelegramLinkToken(email: string): Promise<TelegramLinkToken> {
  // У каждого пользователя может быть только один действующий токен —
  // старые (не использованные) токены этого email больше не нужны.
  for (const [token, record] of Array.from(store.telegramLinkTokens.entries())) {
    if (record.email === email) store.telegramLinkTokens.delete(token);
  }
  const record: TelegramLinkToken = {
    token: id("tglink"),
    email,
    expiresAt: new Date(Date.now() + TELEGRAM_LINK_TOKEN_TTL_MS).toISOString(),
    createdAt: new Date().toISOString(),
  };
  store.telegramLinkTokens.set(record.token, record);
  return record;
}

/** Проверяет и «сжигает» токен, возвращает email владельца или undefined, если токен неверный/просрочен. */
export async function consumeTelegramLinkToken(token: string): Promise<string | undefined> {
  const record = store.telegramLinkTokens.get(token);
  if (!record) return undefined;
  store.telegramLinkTokens.delete(token);
  if (new Date(record.expiresAt).getTime() < Date.now()) return undefined;
  return record.email;
}

export async function setTelegramLink(
  email: string,
  chatId: string,
  username?: string | null,
): Promise<TelegramLink> {
  const existing = store.telegramLinks.get(email);
  const link: TelegramLink = {
    email,
    chatId,
    username: username ?? existing?.username ?? null,
    linkedAt: new Date().toISOString(),
    notifyTaskAssigned: existing?.notifyTaskAssigned ?? true,
    notifyComments: existing?.notifyComments ?? true,
    notifyStageChanges: existing?.notifyStageChanges ?? true,
    notifyTaskDeleted: existing?.notifyTaskDeleted ?? true,
    notifyQuestions: existing?.notifyQuestions ?? true,
    notifyDigest: existing?.notifyDigest ?? true,
    digestHourUtc: existing?.digestHourUtc ?? 4,
  };
  store.telegramLinks.set(email, link);
  return link;
}

export async function getTelegramLinkByEmail(email: string): Promise<TelegramLink | undefined> {
  return store.telegramLinks.get(email);
}

export async function getTelegramLinkByChatId(chatId: string): Promise<TelegramLink | undefined> {
  return Array.from(store.telegramLinks.values()).find((l) => l.chatId === chatId);
}

export async function listTelegramLinks(): Promise<TelegramLink[]> {
  return Array.from(store.telegramLinks.values());
}

export async function deleteTelegramLink(email: string): Promise<void> {
  store.telegramLinks.delete(email);
}

/** Обновляет один флаг-настройку уведомлений (переключатели в UI дёргают эту функцию по одному ключу за раз). */
export async function updateTelegramNotifyPref(
  email: string,
  key: TelegramNotifyPrefKey,
  value: boolean,
): Promise<TelegramLink | undefined> {
  const link = store.telegramLinks.get(email);
  if (!link) return undefined;
  link[key] = value;
  return link;
}

export async function updateTelegramDigestHour(
  email: string,
  hourUtc: number,
): Promise<TelegramLink | undefined> {
  const link = store.telegramLinks.get(email);
  if (!link) return undefined;
  link.digestHourUtc = Math.min(23, Math.max(0, Math.round(hourUtc)));
  return link;
}

// ---------- Telegram: черновики задач из /newtask ----------

const TELEGRAM_DRAFT_TTL_MS = 30 * 60 * 1000;

function draftExpiry(): string {
  return new Date(Date.now() + TELEGRAM_DRAFT_TTL_MS).toISOString();
}

/** Начинает новый диалог создания задачи, затирая незаконченный предыдущий в этом же чате. */
export async function startTelegramDraft(input: {
  chatId: string;
  email: string;
  step: TelegramDraftStep;
  workspaceId?: string | null;
  boardId?: string | null;
}): Promise<TelegramDraft> {
  const draft: TelegramDraft = {
    chatId: input.chatId,
    email: input.email,
    step: input.step,
    workspaceId: input.workspaceId ?? null,
    boardId: input.boardId ?? null,
    title: null,
    assigneeEmail: null,
    dueDate: null,
    calendarMessageId: null,
    calendarMonth: null,
    expiresAt: draftExpiry(),
    updatedAt: new Date().toISOString(),
  };
  store.telegramDrafts.set(input.chatId, draft);
  return draft;
}

/** Возвращает активный черновик чата; протухший считается отсутствующим и сразу удаляется. */
export async function getTelegramDraft(chatId: string): Promise<TelegramDraft | undefined> {
  const draft = store.telegramDrafts.get(chatId);
  if (!draft) return undefined;
  if (new Date(draft.expiresAt).getTime() < Date.now()) {
    store.telegramDrafts.delete(chatId);
    return undefined;
  }
  return draft;
}

/** Обновляет поля черновика и продлевает TTL — каждый шаг диалога отодвигает протухание. */
export async function updateTelegramDraft(
  chatId: string,
  patch: Partial<Pick<TelegramDraft, "step" | "workspaceId" | "boardId" | "title" | "assigneeEmail" | "dueDate" | "calendarMessageId" | "calendarMonth">>,
): Promise<TelegramDraft | undefined> {
  const draft = await getTelegramDraft(chatId);
  if (!draft) return undefined;
  const next: TelegramDraft = {
    ...draft,
    ...patch,
    expiresAt: draftExpiry(),
    updatedAt: new Date().toISOString(),
  };
  store.telegramDrafts.set(chatId, next);
  return next;
}

export async function deleteTelegramDraft(chatId: string): Promise<void> {
  store.telegramDrafts.delete(chatId);
}

// ---------- Google Calendar (OAuth-привязка личного календаря) ----------

export async function setGoogleCalendarLink(
  email: string,
  tokens: { accessToken: string; refreshToken: string; expiryDate: number },
): Promise<GoogleCalendarLink> {
  const existing = store.googleCalendarLinks.get(email);
  const link: GoogleCalendarLink = {
    email,
    accessToken: tokens.accessToken,
    // Google присылает refresh_token только при первом согласии
    // (prompt=consent); если его нет в ответе на обновление — сохраняем
    // прежний, а не затираем пустой строкой.
    refreshToken: tokens.refreshToken || existing?.refreshToken || "",
    expiryDate: tokens.expiryDate,
    connectedAt: existing?.connectedAt ?? new Date().toISOString(),
  };
  store.googleCalendarLinks.set(email, link);
  return link;
}

export async function getGoogleCalendarLink(email: string): Promise<GoogleCalendarLink | undefined> {
  return store.googleCalendarLinks.get(email);
}

export async function deleteGoogleCalendarLink(email: string): Promise<void> {
  store.googleCalendarLinks.delete(email);
}

// ---------- Password reset (самостоятельный сброс через Telegram) ----------

const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export async function createPasswordResetToken(email: string): Promise<PasswordResetToken> {
  for (const [token, record] of Array.from(store.passwordResetTokens.entries())) {
    if (record.email === email) store.passwordResetTokens.delete(token);
  }
  const record: PasswordResetToken = {
    token: id("pwreset"),
    email,
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS).toISOString(),
    createdAt: new Date().toISOString(),
  };
  store.passwordResetTokens.set(record.token, record);
  return record;
}

export async function consumePasswordResetToken(token: string): Promise<string | undefined> {
  const record = store.passwordResetTokens.get(token);
  if (!record) return undefined;
  store.passwordResetTokens.delete(token);
  if (new Date(record.expiresAt).getTime() < Date.now()) return undefined;
  return record.email;
}

// ---------- Мини-игры: доска рекордов ----------

/** Сохраняет результат, только если он выше уже имеющегося (одна запись на пользователя+игру+пространство). */
export async function upsertGameScore(input: {
  workspaceId: string;
  gameId: GameId;
  userEmail: string;
  score: number;
}): Promise<GameScore> {
  const existing = Array.from(store.gameScores.values()).find(
    (s) =>
      s.workspaceId === input.workspaceId && s.gameId === input.gameId && s.userEmail === input.userEmail,
  );
  const now = new Date().toISOString();
  if (existing) {
    if (input.score > existing.score) {
      existing.score = input.score;
      existing.updatedAt = now;
    }
    return existing;
  }
  const record: GameScore = {
    id: id("score"),
    workspaceId: input.workspaceId,
    gameId: input.gameId,
    userEmail: input.userEmail,
    score: input.score,
    createdAt: now,
    updatedAt: now,
  };
  store.gameScores.set(record.id, record);
  return record;
}

export async function listGameLeaderboard(
  workspaceId: string,
  gameId: GameId,
  limit = 10,
): Promise<GameScore[]> {
  return Array.from(store.gameScores.values())
    .filter((s) => s.workspaceId === workspaceId && s.gameId === gameId)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// ---------- Seed ----------

export async function seedIfEmpty(): Promise<void> {
  if (store.seeded) return;
  store.seeded = true;

  const demoEmails = ["anna@team.dev", "ivan@team.dev", "olga@team.dev"];
  for (const email of demoEmails) {
    await addAllowedEmail(email, "system");
  }

  const anna = await registerUser({ email: "anna@team.dev", name: "Анна Соколова", password: "demo1234" });
  const ivan = await registerUser({ email: "ivan@team.dev", name: "Иван Петров", password: "demo1234" });
  const olga = await registerUser({ email: "olga@team.dev", name: "Ольга Ким", password: "demo1234" });
  if ("error" in anna || "error" in ivan || "error" in olga) return;
  const owner = anna.user;
  const dev = ivan.user;
  const design = olga.user;

  const workspace = await createWorkspace({ name: "Основная команда", createdBy: owner.email });
  await addWorkspaceMember(workspace.id, dev.email);
  await addWorkspaceMember(workspace.id, design.email);

  const board = await createBoard({
    workspaceId: workspace.id,
    name: "Запуск мобильного приложения",
    description: "Подготовка релиза v1.0 для iOS и Android",
    ownerEmail: owner.email,
  });
  await addBoardMember(board.id, dev.email);
  await addBoardMember(board.id, design.email);

  const seedTasks: Array<[string, Task["stage"], Task["priority"], string | null]> = [
    ["Спроектировать экран онбординга", "done", "medium", design.email],
    ["Настроить push-уведомления", "done", "high", dev.email],
    ["Интеграция с платёжным шлюзом", "in_progress", "high", dev.email],
    ["Провести аудит доступности", "in_progress", "medium", design.email],
    ["Написать релиз-ноуты", "review", "low", owner.email],
    ["Тестирование на устройствах старых версий", "review", "medium", dev.email],
    ["Согласовать текст App Store листинга", "todo", "medium", owner.email],
    ["Настроить аналитику событий", "todo", "high", dev.email],
    ["Подготовить скриншоты для сторов", "todo", "low", design.email],
  ];
  for (const [title, stage, priority, assignee] of seedTasks) {
    const t = await createTask({
      boardId: board.id,
      title,
      description: "",
      priority,
      assigneeEmail: assignee,
      dueDate: null,
    });
    await updateTask(t.id, { stage, completedAt: stage === "done" ? new Date().toISOString() : null });
  }

  const board2 = await createBoard({
    workspaceId: workspace.id,
    name: "Редизайн сайта",
    description: "Обновление публичного сайта компании",
    ownerEmail: owner.email,
  });
  await addBoardMember(board2.id, design.email);
  const t1 = await createTask({
    boardId: board2.id,
    title: "Собрать референсы",
    description: "",
    priority: "low",
    assigneeEmail: design.email,
    dueDate: null,
  });
  await updateTask(t1.id, { stage: "done", completedAt: new Date().toISOString() });
  await createTask({
    boardId: board2.id,
    title: "Прототип главной страницы",
    description: "",
    priority: "medium",
    assigneeEmail: design.email,
    dueDate: null,
  });

  const question = await createQuestion({
    workspaceId: workspace.id,
    authorEmail: dev.email,
    recipientEmails: [owner.email],
    title: "Можно ли перенести срок интеграции платёжного шлюза на понедельник?",
  });
  await createMessage({
    questionId: question.id,
    authorEmail: owner.email,
    body: "Да, переносим, но держи в курсе прогресс.",
  });
}
