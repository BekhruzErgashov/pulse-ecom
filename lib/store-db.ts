import "server-only";
import { getPool } from "@/lib/pg-client";
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

function rowToUser(row: {
  email: string;
  name: string;
  color: string;
  role: string;
  is_active: boolean;
  created_at: Date;
}): User {
  return {
    email: row.email,
    name: row.name,
    color: row.color,
    role: row.role as User["role"],
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
  };
}

function rowToWorkspace(row: {
  id: string;
  name: string;
  created_by: string;
  created_at: Date;
}): Workspace {
  return {
    id: row.id,
    name: row.name,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

function rowToTask(row: {
  id: string;
  board_id: string;
  title: string;
  description: string;
  result_note: string | null;
  created_by: string | null;
  stage: string;
  priority: string;
  kind: string;
  target_count: number | null;
  found_count: number | null;
  due_date: string | null;
  completed_at: Date | null;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}): Task {
  return {
    id: row.id,
    boardId: row.board_id,
    title: row.title,
    description: row.description,
    resultNote: row.result_note,
    createdBy: row.created_by,
    stage: row.stage as Task["stage"],
    priority: row.priority as Task["priority"],
    kind: (row.kind ?? "normal") as Task["kind"],
    targetCount: row.target_count,
    foundCount: row.found_count,
    // Исполнители приезжают отдельным запросом (см. withAssignees) — в самой
    // строке задачи их нет, связь живёт в task_assignees.
    assigneeEmails: [],
    dueDate: row.due_date,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    archivedAt: row.archived_at ? row.archived_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToQuestion(row: {
  id: string;
  workspace_id: string;
  author_email: string | null;
  title: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}, recipientEmails: string[]): Question {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    authorEmail: row.author_email,
    recipientEmails,
    title: row.title,
    status: row.status as QuestionStatus,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function rowToMessage(row: {
  id: string;
  question_id: string;
  author_email: string | null;
  body: string;
  created_at: Date;
}): QuestionMessage {
  return {
    id: row.id,
    questionId: row.question_id,
    authorEmail: row.author_email,
    body: row.body,
    createdAt: row.created_at.toISOString(),
  };
}

function rowToBoard(row: {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  owner_email: string;
  created_at: Date;
}, memberEmails: string[]): Board {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    description: row.description,
    ownerEmail: row.owner_email,
    memberEmails,
    createdAt: row.created_at.toISOString(),
  };
}

async function boardWithMembers(boardId: string): Promise<Board | undefined> {
  const pool = getPool();
  const boardRes = await pool.query(
    "SELECT id, workspace_id, name, description, owner_email, created_at FROM boards WHERE id = $1",
    [boardId],
  );
  if (boardRes.rowCount === 0) return undefined;
  const membersRes = await pool.query("SELECT email FROM board_members WHERE board_id = $1", [
    boardId,
  ]);
  return rowToBoard(
    boardRes.rows[0],
    membersRes.rows.map((r) => r.email),
  );
}

// ---------- Allowlist ----------

export async function isEmailAllowed(email: string): Promise<boolean> {
  const pool = getPool();
  const res = await pool.query("SELECT 1 FROM allowed_emails WHERE email = $1", [
    email.trim().toLowerCase(),
  ]);
  return (res.rowCount ?? 0) > 0;
}

export async function listAllowedEmails(): Promise<AllowedEmail[]> {
  const pool = getPool();
  const res = await pool.query("SELECT * FROM allowed_emails ORDER BY created_at DESC");
  return res.rows.map((r) => ({
    email: r.email,
    addedBy: r.added_by,
    createdAt: r.created_at.toISOString(),
  }));
}

export async function addAllowedEmail(email: string, addedBy: string): Promise<AllowedEmail> {
  const pool = getPool();
  const normalized = email.trim().toLowerCase();
  const res = await pool.query(
    `INSERT INTO allowed_emails (email, added_by) VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
     RETURNING *`,
    [normalized, addedBy],
  );
  const r = res.rows[0];
  return { email: r.email, addedBy: r.added_by, createdAt: r.created_at.toISOString() };
}

export async function removeAllowedEmail(email: string): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM allowed_emails WHERE email = $1", [email.trim().toLowerCase()]);
}

// ---------- Users / auth ----------

export async function registerUser(input: {
  email: string;
  name: string;
  password: string;
}): Promise<{ user: User } | { error: "not_allowed" | "already_exists" }> {
  const pool = getPool();
  const normalized = input.email.trim().toLowerCase();

  if (!(await isEmailAllowed(normalized))) {
    return { error: "not_allowed" };
  }
  const existing = await pool.query("SELECT 1 FROM users WHERE email = $1", [normalized]);
  if ((existing.rowCount ?? 0) > 0) {
    return { error: "already_exists" };
  }

  const countRes = await pool.query("SELECT count(*)::int AS count FROM users");
  const isFirstUser = countRes.rows[0].count === 0;
  const passwordHash = await hashPassword(input.password);
  const color = colorForEmail(normalized);
  const name = input.name.trim() || normalized.split("@")[0];

  const inserted = await pool.query(
    `INSERT INTO users (email, name, color, password_hash, role, is_active)
     VALUES ($1, $2, $3, $4, $5, true)
     RETURNING *`,
    [normalized, name, color, passwordHash, isFirstUser ? "admin" : "member"],
  );

  const pending = await pool.query(
    "SELECT workspace_id FROM workspace_invites WHERE email = $1",
    [normalized],
  );
  for (const row of pending.rows) {
    await pool.query(
      "INSERT INTO workspace_members (workspace_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [row.workspace_id, normalized],
    );
  }
  await pool.query("DELETE FROM workspace_invites WHERE email = $1", [normalized]);

  return { user: rowToUser(inserted.rows[0]) };
}

export async function verifyLogin(email: string, password: string): Promise<User | null> {
  const pool = getPool();
  const res = await pool.query("SELECT * FROM users WHERE email = $1", [
    email.trim().toLowerCase(),
  ]);
  if (res.rowCount === 0) return null;
  const row = res.rows[0];
  if (!row.is_active) return null;
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return null;
  return rowToUser(row);
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const pool = getPool();
  const res = await pool.query("SELECT * FROM users WHERE email = $1", [
    email.trim().toLowerCase(),
  ]);
  if (res.rowCount === 0) return undefined;
  return rowToUser(res.rows[0]);
}

export async function listUsers(): Promise<User[]> {
  const pool = getPool();
  const res = await pool.query("SELECT * FROM users ORDER BY created_at ASC");
  return res.rows.map(rowToUser);
}

export async function updateUser(
  email: string,
  patch: Partial<Pick<User, "role" | "isActive">>,
): Promise<User | undefined> {
  const pool = getPool();
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (patch.role !== undefined) {
    fields.push(`role = $${i++}`);
    values.push(patch.role);
  }
  if (patch.isActive !== undefined) {
    fields.push(`is_active = $${i++}`);
    values.push(patch.isActive);
  }
  if (fields.length === 0) return getUserByEmail(email);
  values.push(email.trim().toLowerCase());
  const res = await pool.query(
    `UPDATE users SET ${fields.join(", ")} WHERE email = $${i} RETURNING *`,
    values,
  );
  if (res.rowCount === 0) return undefined;
  return rowToUser(res.rows[0]);
}

export async function countAdmins(): Promise<number> {
  const pool = getPool();
  const res = await pool.query(
    "SELECT count(*)::int AS count FROM users WHERE role = 'admin' AND is_active = true",
  );
  return res.rows[0].count;
}

export async function resetUserPassword(email: string, newPassword: string): Promise<boolean> {
  const pool = getPool();
  const passwordHash = await hashPassword(newPassword);
  const res = await pool.query(
    "UPDATE users SET password_hash = $1 WHERE email = $2",
    [passwordHash, email.trim().toLowerCase()],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function changeOwnPassword(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<boolean> {
  const pool = getPool();
  const normalized = email.trim().toLowerCase();
  const res = await pool.query("SELECT password_hash FROM users WHERE email = $1", [normalized]);
  if (res.rowCount === 0) return false;
  const ok = await verifyPassword(currentPassword, res.rows[0].password_hash);
  if (!ok) return false;
  const passwordHash = await hashPassword(newPassword);
  await pool.query("UPDATE users SET password_hash = $1 WHERE email = $2", [
    passwordHash,
    normalized,
  ]);
  return true;
}

export async function deleteUser(
  email: string,
): Promise<{ ok: true } | { error: "owns_workspaces" | "owns_boards" | "not_found" }> {
  const pool = getPool();
  const normalized = email.trim().toLowerCase();

  const existing = await pool.query("SELECT 1 FROM users WHERE email = $1", [normalized]);
  if ((existing.rowCount ?? 0) === 0) return { error: "not_found" };

  const ownsWorkspace = await pool.query(
    "SELECT 1 FROM workspaces WHERE created_by = $1 LIMIT 1",
    [normalized],
  );
  if ((ownsWorkspace.rowCount ?? 0) > 0) return { error: "owns_workspaces" };

  const ownsBoard = await pool.query("SELECT 1 FROM boards WHERE owner_email = $1 LIMIT 1", [
    normalized,
  ]);
  if ((ownsBoard.rowCount ?? 0) > 0) return { error: "owns_boards" };

  await pool.query("DELETE FROM task_assignees WHERE email = $1", [normalized]);
  await pool.query("UPDATE tasks SET created_by = NULL WHERE created_by = $1", [normalized]);
  await pool.query("UPDATE questions SET author_email = NULL WHERE author_email = $1", [
    normalized,
  ]);
  await pool.query("UPDATE question_messages SET author_email = NULL WHERE author_email = $1", [
    normalized,
  ]);
  await pool.query("DELETE FROM question_recipients WHERE email = $1", [normalized]);
  await pool.query("DELETE FROM board_members WHERE email = $1", [normalized]);
  await pool.query("DELETE FROM workspace_members WHERE email = $1", [normalized]);
  await pool.query("DELETE FROM allowed_emails WHERE email = $1", [normalized]);
  await pool.query("DELETE FROM users WHERE email = $1", [normalized]);

  return { ok: true };
}

// ---------- Workspaces ----------

export async function createWorkspace(input: {
  name: string;
  createdBy: string;
}): Promise<Workspace> {
  const pool = getPool();
  const workspaceId = id("ws");
  const res = await pool.query(
    "INSERT INTO workspaces (id, name, created_by) VALUES ($1, $2, $3) RETURNING *",
    [workspaceId, input.name, input.createdBy],
  );
  await pool.query(
    "INSERT INTO workspace_members (workspace_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [workspaceId, input.createdBy],
  );
  return rowToWorkspace(res.rows[0]);
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const pool = getPool();
  const res = await pool.query("SELECT * FROM workspaces ORDER BY created_at ASC");
  return res.rows.map(rowToWorkspace);
}

export async function listWorkspacesForUser(email: string): Promise<Workspace[]> {
  const pool = getPool();
  const res = await pool.query(
    `SELECT w.* FROM workspaces w
     JOIN workspace_members wm ON wm.workspace_id = w.id
     WHERE wm.email = $1
     ORDER BY w.created_at ASC`,
    [email],
  );
  return res.rows.map(rowToWorkspace);
}

export async function getWorkspace(workspaceId: string): Promise<Workspace | undefined> {
  const pool = getPool();
  const res = await pool.query("SELECT * FROM workspaces WHERE id = $1", [workspaceId]);
  if (res.rowCount === 0) return undefined;
  return rowToWorkspace(res.rows[0]);
}

export async function isWorkspaceMember(workspaceId: string, email: string): Promise<boolean> {
  const pool = getPool();
  const res = await pool.query(
    "SELECT 1 FROM workspace_members WHERE workspace_id = $1 AND email = $2",
    [workspaceId, email],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function listWorkspaceMemberEmails(workspaceId: string): Promise<string[]> {
  const pool = getPool();
  const res = await pool.query(
    "SELECT email FROM workspace_members WHERE workspace_id = $1",
    [workspaceId],
  );
  return res.rows.map((r) => r.email);
}

export async function addWorkspaceMember(workspaceId: string, email: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    "INSERT INTO workspace_members (workspace_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [workspaceId, email],
  );
}

export async function removeWorkspaceMember(workspaceId: string, email: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    "DELETE FROM workspace_members WHERE workspace_id = $1 AND email = $2",
    [workspaceId, email],
  );
}

export async function inviteWorkspaceMember(
  workspaceId: string,
  email: string,
): Promise<"added" | "pending"> {
  const pool = getPool();
  const normalized = email.trim().toLowerCase();
  const existing = await pool.query("SELECT 1 FROM users WHERE email = $1", [normalized]);
  if ((existing.rowCount ?? 0) > 0) {
    await addWorkspaceMember(workspaceId, normalized);
    return "added";
  }
  await pool.query(
    "INSERT INTO workspace_invites (workspace_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [workspaceId, normalized],
  );
  return "pending";
}

export async function listPendingInvites(workspaceId: string): Promise<string[]> {
  const pool = getPool();
  const res = await pool.query(
    "SELECT email FROM workspace_invites WHERE workspace_id = $1",
    [workspaceId],
  );
  return res.rows.map((r) => r.email);
}

export async function removePendingInvite(workspaceId: string, email: string): Promise<void> {
  const pool = getPool();
  await pool.query(
    "DELETE FROM workspace_invites WHERE workspace_id = $1 AND email = $2",
    [workspaceId, email.trim().toLowerCase()],
  );
}

// ---------- Boards ----------

export async function createBoard(input: {
  workspaceId: string;
  name: string;
  description: string;
  ownerEmail: string;
}): Promise<Board> {
  const pool = getPool();
  const boardId = id("board");
  await pool.query(
    "INSERT INTO boards (id, workspace_id, name, description, owner_email) VALUES ($1, $2, $3, $4, $5)",
    [boardId, input.workspaceId, input.name, input.description, input.ownerEmail],
  );
  await pool.query(
    "INSERT INTO board_members (board_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [boardId, input.ownerEmail],
  );
  const board = await boardWithMembers(boardId);
  return board!;
}

export async function listBoards(workspaceId: string): Promise<Board[]> {
  const pool = getPool();
  const boardsRes = await pool.query(
    "SELECT id, workspace_id, name, description, owner_email, created_at FROM boards WHERE workspace_id = $1 ORDER BY created_at DESC",
    [workspaceId],
  );
  if (boardsRes.rows.length === 0) return [];
  const ids = boardsRes.rows.map((r) => r.id);
  const membersRes = await pool.query(
    "SELECT board_id, email FROM board_members WHERE board_id = ANY($1)",
    [ids],
  );
  const membersByBoard = new Map<string, string[]>();
  for (const row of membersRes.rows) {
    const list = membersByBoard.get(row.board_id) ?? [];
    list.push(row.email);
    membersByBoard.set(row.board_id, list);
  }
  return boardsRes.rows.map((row) => rowToBoard(row, membersByBoard.get(row.id) ?? []));
}

export async function getBoard(boardId: string): Promise<Board | undefined> {
  return boardWithMembers(boardId);
}

export async function listMyTasksInWorkspace(
  workspaceId: string,
  email: string,
): Promise<TaskWithBoard[]> {
  const pool = getPool();
  const res = await pool.query(
    `SELECT t.*, b.name AS board_name
     FROM tasks t
     JOIN boards b ON b.id = t.board_id
     JOIN task_assignees ta ON ta.task_id = t.id
     WHERE b.workspace_id = $1 AND ta.email = $2 AND t.archived_at IS NULL
     ORDER BY t.created_at DESC`,
    [workspaceId, email],
  );
  return withAssignees(res.rows.map((row) => ({ ...rowToTask(row), boardName: row.board_name })));
}

/** Задачи, которые пользователь поставил сам (он автор) — зеркало listMyTasksInWorkspace, где он исполнитель. */
export async function listTasksCreatedByInWorkspace(
  workspaceId: string,
  email: string,
): Promise<TaskWithBoard[]> {
  const pool = getPool();
  const res = await pool.query(
    `SELECT t.*, b.name AS board_name
     FROM tasks t
     JOIN boards b ON b.id = t.board_id
     WHERE b.workspace_id = $1 AND t.created_by = $2 AND t.archived_at IS NULL
     ORDER BY t.created_at DESC`,
    [workspaceId, email],
  );
  return withAssignees(res.rows.map((row) => ({ ...rowToTask(row), boardName: row.board_name })));
}

export async function deleteBoard(boardId: string): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM boards WHERE id = $1", [boardId]);
}

export async function addBoardMember(boardId: string, email: string): Promise<Board | undefined> {
  const pool = getPool();
  await pool.query(
    "INSERT INTO board_members (board_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [boardId, email],
  );
  return boardWithMembers(boardId);
}

export async function updateBoard(
  boardId: string,
  patch: Partial<Pick<Board, "name" | "description">>,
): Promise<Board | undefined> {
  const pool = getPool();
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (patch.name !== undefined) {
    fields.push(`name = $${i++}`);
    values.push(patch.name);
  }
  if (patch.description !== undefined) {
    fields.push(`description = $${i++}`);
    values.push(patch.description);
  }
  if (fields.length === 0) return boardWithMembers(boardId);
  values.push(boardId);
  await pool.query(`UPDATE boards SET ${fields.join(", ")} WHERE id = $${i}`, values);
  return boardWithMembers(boardId);
}

// ---------- Tasks ----------

/**
 * Догружает исполнителей сразу для пачки задач. Отдельным запросом, а не
 * JOIN-ом: задача с тремя исполнителями иначе размножилась бы на три строки,
 * и пришлось бы схлопывать их вручную.
 */
async function withAssignees<T extends Task>(tasks: T[]): Promise<T[]> {
  if (tasks.length === 0) return tasks;
  const pool = getPool();
  const res = await pool.query<{ task_id: string; email: string }>(
    "SELECT task_id, email FROM task_assignees WHERE task_id = ANY($1::text[]) ORDER BY email",
    [tasks.map((t) => t.id)],
  );
  const byTask = new Map<string, string[]>();
  for (const row of res.rows) {
    const list = byTask.get(row.task_id);
    if (list) list.push(row.email);
    else byTask.set(row.task_id, [row.email]);
  }
  return tasks.map((task) => ({ ...task, assigneeEmails: byTask.get(task.id) ?? [] }));
}

/** Полностью заменяет список исполнителей задачи — так проще и надёжнее, чем считать разницу. */
async function replaceAssignees(taskId: string, emails: string[]): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM task_assignees WHERE task_id = $1", [taskId]);
  const unique = Array.from(new Set(emails.map((e) => e.toLowerCase()))).filter(Boolean);
  if (unique.length === 0) return;
  await pool.query(
    "INSERT INTO task_assignees (task_id, email) SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING",
    [taskId, unique],
  );
}

export async function createTask(input: {
  boardId: string;
  title: string;
  description: string;
  priority: Task["priority"];
  kind?: Task["kind"];
  targetCount?: number | null;
  foundCount?: number | null;
  assigneeEmails: string[];
  dueDate: string | null;
  createdBy?: string | null;
}): Promise<Task> {
  const pool = getPool();
  const taskId = id("task");
  const res = await pool.query(
    `INSERT INTO tasks (id, board_id, title, description, stage, priority, kind, target_count, found_count, due_date, created_by)
     VALUES ($1, $2, $3, $4, 'todo', $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      taskId,
      input.boardId,
      input.title,
      input.description,
      input.priority,
      input.kind ?? "normal",
      input.targetCount ?? null,
      input.foundCount ?? null,
      input.dueDate,
      input.createdBy ?? null,
    ],
  );
  await replaceAssignees(taskId, input.assigneeEmails);
  return { ...rowToTask(res.rows[0]), assigneeEmails: input.assigneeEmails };
}

export async function listTasksByBoard(boardId: string): Promise<Task[]> {
  const pool = getPool();
  const res = await pool.query(
    "SELECT * FROM tasks WHERE board_id = $1 AND archived_at IS NULL ORDER BY created_at ASC",
    [boardId],
  );
  return withAssignees(res.rows.map(rowToTask));
}

/** Задачи, убранные в архив — отдельный список, в обычную доску они не попадают. Свежие сверху. */
export async function listArchivedTasksByBoard(boardId: string): Promise<Task[]> {
  const pool = getPool();
  const res = await pool.query(
    "SELECT * FROM tasks WHERE board_id = $1 AND archived_at IS NOT NULL ORDER BY archived_at DESC",
    [boardId],
  );
  return withAssignees(res.rows.map(rowToTask));
}

export async function getTask(taskId: string): Promise<Task | undefined> {
  const pool = getPool();
  const res = await pool.query("SELECT * FROM tasks WHERE id = $1", [taskId]);
  if (res.rowCount === 0) return undefined;
  return (await withAssignees([rowToTask(res.rows[0])]))[0];
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
      | "assigneeEmails"
      | "dueDate"
      | "completedAt"
      | "archivedAt"
    >
  >,
): Promise<Task | undefined> {
  const pool = getPool();
  // Исполнители лежат не в строке задачи — вынимаем их из патча до того, как
  // остальные поля пойдут в UPDATE.
  const { assigneeEmails, ...columns } = patch;
  if (assigneeEmails) await replaceAssignees(taskId, assigneeEmails);
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  const columnMap: Record<string, string> = {
    title: "title",
    description: "description",
    resultNote: "result_note",
    stage: "stage",
    priority: "priority",
    kind: "kind",
    targetCount: "target_count",
    foundCount: "found_count",
    dueDate: "due_date",
    completedAt: "completed_at",
    archivedAt: "archived_at",
  };
  for (const [key, value] of Object.entries(columns)) {
    const column = columnMap[key];
    if (!column) continue;
    fields.push(`${column} = $${i}`);
    values.push(value);
    i++;
  }
  fields.push(`updated_at = now()`);
  values.push(taskId);
  const res = await pool.query(
    `UPDATE tasks SET ${fields.join(", ")} WHERE id = $${i} RETURNING *`,
    values,
  );
  if (res.rowCount === 0) return undefined;
  return (await withAssignees([rowToTask(res.rows[0])]))[0];
}

export async function deleteTask(taskId: string): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM tasks WHERE id = $1", [taskId]);
}

// ---------- Task attachments (скриншоты) ----------

function rowToTaskAttachment(row: {
  id: string;
  task_id: string;
  uploaded_by: string | null;
  filename: string;
  content_type: string;
  size_bytes: number;
  data: string;
  created_at: Date;
}): TaskAttachment {
  return {
    id: row.id,
    taskId: row.task_id,
    uploadedBy: row.uploaded_by,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    data: row.data,
    createdAt: row.created_at.toISOString(),
  };
}

export async function addTaskAttachment(input: {
  taskId: string;
  uploadedBy: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  data: string;
}): Promise<TaskAttachment> {
  const pool = getPool();
  const attachmentId = id("attachment");
  const res = await pool.query(
    `INSERT INTO task_attachments (id, task_id, uploaded_by, filename, content_type, size_bytes, data)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      attachmentId,
      input.taskId,
      input.uploadedBy,
      input.filename,
      input.contentType,
      input.sizeBytes,
      input.data,
    ],
  );
  return rowToTaskAttachment(res.rows[0]);
}

export async function listTaskAttachments(taskId: string): Promise<TaskAttachment[]> {
  const pool = getPool();
  const res = await pool.query(
    "SELECT * FROM task_attachments WHERE task_id = $1 ORDER BY created_at ASC",
    [taskId],
  );
  return res.rows.map(rowToTaskAttachment);
}

export async function countTaskAttachments(taskId: string): Promise<number> {
  const pool = getPool();
  const res = await pool.query(
    "SELECT count(*)::int AS count FROM task_attachments WHERE task_id = $1",
    [taskId],
  );
  return res.rows[0].count;
}

export async function getTaskAttachment(attachmentId: string): Promise<TaskAttachment | undefined> {
  const pool = getPool();
  const res = await pool.query("SELECT * FROM task_attachments WHERE id = $1", [attachmentId]);
  if (res.rowCount === 0) return undefined;
  return rowToTaskAttachment(res.rows[0]);
}

export async function deleteTaskAttachment(attachmentId: string): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM task_attachments WHERE id = $1", [attachmentId]);
}

// ---------- Questions ----------

export async function createQuestion(input: {
  workspaceId: string;
  authorEmail: string;
  recipientEmails: string[];
  title: string;
}): Promise<Question> {
  const pool = getPool();
  const questionId = id("q");
  const res = await pool.query(
    `INSERT INTO questions (id, workspace_id, author_email, title, status) VALUES ($1, $2, $3, $4, 'open') RETURNING *`,
    [questionId, input.workspaceId, input.authorEmail, input.title],
  );
  const uniqueRecipients = Array.from(new Set(input.recipientEmails));
  for (const email of uniqueRecipients) {
    await pool.query(
      "INSERT INTO question_recipients (question_id, email) VALUES ($1, $2) ON CONFLICT DO NOTHING",
      [questionId, email],
    );
  }
  return rowToQuestion(res.rows[0], uniqueRecipients);
}

export async function listQuestionsForUser(
  workspaceId: string,
  email: string,
): Promise<Question[]> {
  const pool = getPool();
  const res = await pool.query(
    `SELECT DISTINCT q.* FROM questions q
     LEFT JOIN question_recipients qr ON qr.question_id = q.id
     WHERE q.workspace_id = $1 AND (q.author_email = $2 OR qr.email = $2)
     ORDER BY q.updated_at DESC`,
    [workspaceId, email],
  );
  if (res.rows.length === 0) return [];
  const ids = res.rows.map((r) => r.id);
  const recipientsRes = await pool.query(
    "SELECT question_id, email FROM question_recipients WHERE question_id = ANY($1)",
    [ids],
  );
  const recipientsByQuestion = new Map<string, string[]>();
  for (const r of recipientsRes.rows) {
    const list = recipientsByQuestion.get(r.question_id) ?? [];
    list.push(r.email);
    recipientsByQuestion.set(r.question_id, list);
  }
  return res.rows.map((row) => rowToQuestion(row, recipientsByQuestion.get(row.id) ?? []));
}

export async function getQuestion(questionId: string): Promise<Question | undefined> {
  const pool = getPool();
  const res = await pool.query("SELECT * FROM questions WHERE id = $1", [questionId]);
  if (res.rowCount === 0) return undefined;
  const recipientsRes = await pool.query(
    "SELECT email FROM question_recipients WHERE question_id = $1",
    [questionId],
  );
  return rowToQuestion(
    res.rows[0],
    recipientsRes.rows.map((r) => r.email),
  );
}

export async function updateQuestionStatus(
  questionId: string,
  status: QuestionStatus,
): Promise<Question | undefined> {
  const pool = getPool();
  const res = await pool.query(
    "UPDATE questions SET status = $1, updated_at = now() WHERE id = $2 RETURNING *",
    [status, questionId],
  );
  if (res.rowCount === 0) return undefined;
  const recipientsRes = await pool.query(
    "SELECT email FROM question_recipients WHERE question_id = $1",
    [questionId],
  );
  return rowToQuestion(
    res.rows[0],
    recipientsRes.rows.map((r) => r.email),
  );
}

export async function createMessage(input: {
  questionId: string;
  authorEmail: string;
  body: string;
}): Promise<QuestionMessage> {
  const pool = getPool();
  const messageId = id("msg");
  const res = await pool.query(
    `INSERT INTO question_messages (id, question_id, author_email, body)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [messageId, input.questionId, input.authorEmail, input.body],
  );
  await pool.query("UPDATE questions SET updated_at = now() WHERE id = $1", [input.questionId]);
  return rowToMessage(res.rows[0]);
}

export async function listMessages(questionId: string): Promise<QuestionMessage[]> {
  const pool = getPool();
  const res = await pool.query(
    "SELECT * FROM question_messages WHERE question_id = $1 ORDER BY created_at ASC",
    [questionId],
  );
  return res.rows.map(rowToMessage);
}

// ---------- Notes (личные, видны только владельцу) ----------

function rowToNoteFolder(row: {
  id: string;
  owner_email: string;
  name: string;
  created_at: Date;
}): NoteFolder {
  return {
    id: row.id,
    ownerEmail: row.owner_email,
    name: row.name,
    createdAt: row.created_at.toISOString(),
  };
}

function rowToNote(row: {
  id: string;
  owner_email: string;
  folder_id: string | null;
  title: string;
  body: string;
  created_at: Date;
  updated_at: Date;
}): Note {
  return {
    id: row.id,
    ownerEmail: row.owner_email,
    folderId: row.folder_id,
    title: row.title,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function createNoteFolder(input: {
  ownerEmail: string;
  name: string;
}): Promise<NoteFolder> {
  const pool = getPool();
  const folderId = id("folder");
  const res = await pool.query(
    "INSERT INTO note_folders (id, owner_email, name) VALUES ($1, $2, $3) RETURNING *",
    [folderId, input.ownerEmail, input.name],
  );
  return rowToNoteFolder(res.rows[0]);
}

export async function listNoteFolders(ownerEmail: string): Promise<NoteFolder[]> {
  const pool = getPool();
  const res = await pool.query(
    "SELECT * FROM note_folders WHERE owner_email = $1 ORDER BY created_at ASC",
    [ownerEmail],
  );
  return res.rows.map(rowToNoteFolder);
}

export async function deleteNoteFolder(ownerEmail: string, folderId: string): Promise<void> {
  const pool = getPool();
  const owned = await pool.query(
    "SELECT 1 FROM note_folders WHERE id = $1 AND owner_email = $2",
    [folderId, ownerEmail],
  );
  if ((owned.rowCount ?? 0) === 0) return;
  await pool.query(
    "UPDATE notes SET folder_id = NULL WHERE folder_id = $1 AND owner_email = $2",
    [folderId, ownerEmail],
  );
  await pool.query("DELETE FROM note_folders WHERE id = $1", [folderId]);
}

export async function createNote(input: {
  ownerEmail: string;
  title: string;
  body: string;
  folderId: string | null;
}): Promise<Note> {
  const pool = getPool();
  const noteId = id("note");
  const res = await pool.query(
    `INSERT INTO notes (id, owner_email, folder_id, title, body)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [noteId, input.ownerEmail, input.folderId, input.title, input.body],
  );
  return rowToNote(res.rows[0]);
}

export async function listNotes(ownerEmail: string): Promise<Note[]> {
  const pool = getPool();
  const res = await pool.query(
    "SELECT * FROM notes WHERE owner_email = $1 ORDER BY updated_at DESC",
    [ownerEmail],
  );
  return res.rows.map(rowToNote);
}

export async function getNote(ownerEmail: string, noteId: string): Promise<Note | undefined> {
  const pool = getPool();
  const res = await pool.query("SELECT * FROM notes WHERE id = $1 AND owner_email = $2", [
    noteId,
    ownerEmail,
  ]);
  if (res.rowCount === 0) return undefined;
  return rowToNote(res.rows[0]);
}

export async function updateNote(
  ownerEmail: string,
  noteId: string,
  patch: Partial<Pick<Note, "title" | "body" | "folderId">>,
): Promise<Note | undefined> {
  const pool = getPool();
  const fields: string[] = [];
  const values: unknown[] = [];
  let i = 1;
  if (patch.title !== undefined) {
    fields.push(`title = $${i++}`);
    values.push(patch.title);
  }
  if (patch.body !== undefined) {
    fields.push(`body = $${i++}`);
    values.push(patch.body);
  }
  if (patch.folderId !== undefined) {
    fields.push(`folder_id = $${i++}`);
    values.push(patch.folderId);
  }
  fields.push(`updated_at = now()`);
  values.push(noteId, ownerEmail);
  const res = await pool.query(
    `UPDATE notes SET ${fields.join(", ")} WHERE id = $${i} AND owner_email = $${i + 1} RETURNING *`,
    values,
  );
  if (res.rowCount === 0) return undefined;
  return rowToNote(res.rows[0]);
}

export async function deleteNote(ownerEmail: string, noteId: string): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM notes WHERE id = $1 AND owner_email = $2", [noteId, ownerEmail]);
}

// ---------- Work links (рабочие ссылки, общие для пространства) ----------

function rowToWorkLink(row: {
  id: string;
  workspace_id: string;
  title: string;
  url: string;
  description: string;
  created_by: string | null;
  created_at: Date;
}): WorkLink {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    url: row.url,
    description: row.description,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

export async function createWorkLink(input: {
  workspaceId: string;
  title: string;
  url: string;
  description: string;
  createdBy: string | null;
}): Promise<WorkLink> {
  const pool = getPool();
  const linkId = id("link");
  const res = await pool.query(
    `INSERT INTO work_links (id, workspace_id, title, url, description, created_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [linkId, input.workspaceId, input.title, input.url, input.description, input.createdBy],
  );
  return rowToWorkLink(res.rows[0]);
}

export async function listWorkLinks(workspaceId: string): Promise<WorkLink[]> {
  const pool = getPool();
  const res = await pool.query(
    "SELECT * FROM work_links WHERE workspace_id = $1 ORDER BY created_at DESC",
    [workspaceId],
  );
  return res.rows.map(rowToWorkLink);
}

export async function getWorkLink(linkId: string): Promise<WorkLink | undefined> {
  const pool = getPool();
  const res = await pool.query("SELECT * FROM work_links WHERE id = $1", [linkId]);
  if (res.rowCount === 0) return undefined;
  return rowToWorkLink(res.rows[0]);
}

export async function deleteWorkLink(linkId: string): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM work_links WHERE id = $1", [linkId]);
}

// ---------- Telegram (привязка аккаунта к боту) ----------

const TELEGRAM_LINK_TOKEN_TTL_MS = 15 * 60 * 1000;

function rowToTelegramLink(row: {
  email: string;
  chat_id: string;
  username: string | null;
  linked_at: Date;
  notify_task_assigned: boolean;
  notify_comments: boolean;
  notify_stage_changes: boolean;
  notify_task_deleted: boolean;
  notify_questions: boolean;
  notify_digest: boolean;
  digest_hour_utc: number;
}): TelegramLink {
  return {
    email: row.email,
    chatId: row.chat_id,
    username: row.username,
    linkedAt: row.linked_at.toISOString(),
    notifyTaskAssigned: row.notify_task_assigned,
    notifyComments: row.notify_comments,
    notifyStageChanges: row.notify_stage_changes,
    notifyTaskDeleted: row.notify_task_deleted,
    notifyQuestions: row.notify_questions,
    notifyDigest: row.notify_digest,
    digestHourUtc: row.digest_hour_utc,
  };
}

const PREF_COLUMN: Record<TelegramNotifyPrefKey, string> = {
  notifyTaskAssigned: "notify_task_assigned",
  notifyComments: "notify_comments",
  notifyStageChanges: "notify_stage_changes",
  notifyTaskDeleted: "notify_task_deleted",
  notifyQuestions: "notify_questions",
  notifyDigest: "notify_digest",
};

function rowToTaskEvent(row: {
  id: string;
  task_id: string;
  type: string;
  author_email: string | null;
  body: string | null;
  from_value: string | null;
  to_value: string | null;
  created_at: Date;
}): TaskEvent {
  return {
    id: row.id,
    taskId: row.task_id,
    type: row.type as TaskEventType,
    authorEmail: row.author_email,
    body: row.body,
    fromValue: row.from_value,
    toValue: row.to_value,
    createdAt: row.created_at.toISOString(),
  };
}

function rowToNotification(row: {
  id: string;
  user_email: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  created_at: Date;
}): Notification {
  return {
    id: row.id,
    userEmail: row.user_email,
    type: row.type as NotificationType,
    title: row.title,
    body: row.body,
    link: row.link,
    read: row.read,
    createdAt: row.created_at.toISOString(),
  };
}

export async function createTelegramLinkToken(email: string): Promise<TelegramLinkToken> {
  const pool = getPool();
  // У каждого пользователя может быть только один действующий токен.
  await pool.query("DELETE FROM telegram_link_tokens WHERE email = $1", [email]);
  const token = id("tglink");
  const expiresAt = new Date(Date.now() + TELEGRAM_LINK_TOKEN_TTL_MS);
  const res = await pool.query<{ token: string; email: string; expires_at: Date; created_at: Date }>(
    `INSERT INTO telegram_link_tokens (token, email, expires_at)
     VALUES ($1, $2, $3) RETURNING *`,
    [token, email, expiresAt.toISOString()],
  );
  const row = res.rows[0];
  return {
    token: row.token,
    email: row.email,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

/** Проверяет и «сжигает» токен, возвращает email владельца или undefined, если токен неверный/просрочен. */
export async function consumeTelegramLinkToken(token: string): Promise<string | undefined> {
  const pool = getPool();
  const res = await pool.query<{ email: string; expires_at: Date }>(
    "DELETE FROM telegram_link_tokens WHERE token = $1 RETURNING email, expires_at",
    [token],
  );
  if (res.rowCount === 0) return undefined;
  const row = res.rows[0];
  if (row.expires_at.getTime() < Date.now()) return undefined;
  return row.email;
}

export async function setTelegramLink(
  email: string,
  chatId: string,
  username?: string | null,
): Promise<TelegramLink> {
  const pool = getPool();
  const res = await pool.query(
    `INSERT INTO telegram_links (email, chat_id, username)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET chat_id = EXCLUDED.chat_id, username = COALESCE(EXCLUDED.username, telegram_links.username), linked_at = now()
     RETURNING *`,
    [email, chatId, username ?? null],
  );
  return rowToTelegramLink(res.rows[0]);
}

/** Обновляет один флаг-настройку уведомлений. */
export async function updateTelegramNotifyPref(
  email: string,
  key: TelegramNotifyPrefKey,
  value: boolean,
): Promise<TelegramLink | undefined> {
  const pool = getPool();
  const column = PREF_COLUMN[key];
  const res = await pool.query(
    `UPDATE telegram_links SET ${column} = $2 WHERE email = $1 RETURNING *`,
    [email, value],
  );
  if (res.rowCount === 0) return undefined;
  return rowToTelegramLink(res.rows[0]);
}

export async function updateTelegramDigestHour(
  email: string,
  hourUtc: number,
): Promise<TelegramLink | undefined> {
  const pool = getPool();
  const hour = Math.min(23, Math.max(0, Math.round(hourUtc)));
  const res = await pool.query(
    "UPDATE telegram_links SET digest_hour_utc = $2 WHERE email = $1 RETURNING *",
    [email, hour],
  );
  if (res.rowCount === 0) return undefined;
  return rowToTelegramLink(res.rows[0]);
}

export async function getTelegramLinkByEmail(email: string): Promise<TelegramLink | undefined> {
  const pool = getPool();
  const res = await pool.query("SELECT * FROM telegram_links WHERE email = $1", [email]);
  if (res.rowCount === 0) return undefined;
  return rowToTelegramLink(res.rows[0]);
}

export async function getTelegramLinkByChatId(chatId: string): Promise<TelegramLink | undefined> {
  const pool = getPool();
  const res = await pool.query("SELECT * FROM telegram_links WHERE chat_id = $1", [chatId]);
  if (res.rowCount === 0) return undefined;
  return rowToTelegramLink(res.rows[0]);
}

export async function listTelegramLinks(): Promise<TelegramLink[]> {
  const pool = getPool();
  const res = await pool.query("SELECT * FROM telegram_links");
  return res.rows.map(rowToTelegramLink);
}

export async function deleteTelegramLink(email: string): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM telegram_links WHERE email = $1", [email]);
}

// ---------- Telegram: черновики задач из /newtask ----------

const TELEGRAM_DRAFT_TTL_MS = 30 * 60 * 1000;

function rowToTelegramDraft(row: {
  chat_id: string;
  email: string;
  step: string;
  workspace_id: string | null;
  board_id: string | null;
  title: string | null;
  description: string | null;
  kind: string | null;
  priority: string | null;
  assignee_emails: string | null;
  due_date: string | null;
  calendar_message_id: string | number | null;
  calendar_month: string | null;
  editing_task_id: string | null;
  expires_at: Date;
  updated_at: Date;
}): TelegramDraft {
  return {
    chatId: row.chat_id,
    email: row.email,
    step: row.step as TelegramDraftStep,
    workspaceId: row.workspace_id,
    boardId: row.board_id,
    title: row.title,
    description: row.description,
    kind: (row.kind as TelegramDraft["kind"]) ?? null,
    priority: (row.priority as TelegramDraft["priority"]) ?? null,
    assigneeEmails: row.assignee_emails ? row.assignee_emails.split(",").filter(Boolean) : [],
    dueDate: row.due_date,
    // BIGINT приходит из pg строкой — приводим к числу, Telegram message_id
    // помещается в Number без потерь.
    calendarMessageId: row.calendar_message_id === null ? null : Number(row.calendar_message_id),
    calendarMonth: row.calendar_month,
    editingTaskId: row.editing_task_id,
    expiresAt: row.expires_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Начинает новый диалог создания задачи, затирая незаконченный предыдущий в этом же чате. */
export async function startTelegramDraft(input: {
  chatId: string;
  email: string;
  step: TelegramDraftStep;
  workspaceId?: string | null;
  boardId?: string | null;
  editingTaskId?: string | null;
}): Promise<TelegramDraft> {
  const pool = getPool();
  const expiresAt = new Date(Date.now() + TELEGRAM_DRAFT_TTL_MS).toISOString();
  const res = await pool.query(
    `INSERT INTO telegram_drafts (chat_id, email, step, workspace_id, board_id, title, assignee_emails, due_date, calendar_message_id, calendar_month, editing_task_id, expires_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NULL, NULL, NULL, NULL, NULL, $6, $7, now())
     ON CONFLICT (chat_id) DO UPDATE SET
       email = EXCLUDED.email,
       step = EXCLUDED.step,
       workspace_id = EXCLUDED.workspace_id,
       board_id = EXCLUDED.board_id,
       title = NULL,
       description = NULL,
       kind = NULL,
       priority = NULL,
       assignee_emails = NULL,
       due_date = NULL,
       calendar_message_id = NULL,
       calendar_month = NULL,
       editing_task_id = EXCLUDED.editing_task_id,
       expires_at = EXCLUDED.expires_at,
       updated_at = now()
     RETURNING *`,
    [
      input.chatId,
      input.email,
      input.step,
      input.workspaceId ?? null,
      input.boardId ?? null,
      input.editingTaskId ?? null,
      expiresAt,
    ],
  );
  return rowToTelegramDraft(res.rows[0]);
}

/** Возвращает активный черновик чата; протухший считается отсутствующим и сразу удаляется. */
export async function getTelegramDraft(chatId: string): Promise<TelegramDraft | undefined> {
  const pool = getPool();
  const res = await pool.query("SELECT * FROM telegram_drafts WHERE chat_id = $1", [chatId]);
  if (res.rowCount === 0) return undefined;
  const draft = rowToTelegramDraft(res.rows[0]);
  if (new Date(draft.expiresAt).getTime() < Date.now()) {
    await pool.query("DELETE FROM telegram_drafts WHERE chat_id = $1", [chatId]);
    return undefined;
  }
  return draft;
}

const DRAFT_COLUMN: Record<string, string> = {
  step: "step",
  workspaceId: "workspace_id",
  boardId: "board_id",
  title: "title",
  description: "description",
  kind: "kind",
  priority: "priority",
  assigneeEmails: "assignee_emails",
  dueDate: "due_date",
  calendarMessageId: "calendar_message_id",
  calendarMonth: "calendar_month",
  editingTaskId: "editing_task_id",
};

/** Обновляет поля черновика и продлевает TTL — каждый шаг диалога отодвигает протухание. */
export async function updateTelegramDraft(
  chatId: string,
  patch: Partial<
    Pick<
      TelegramDraft,
      | "step"
      | "workspaceId"
      | "boardId"
      | "title"
      | "description"
      | "kind"
      | "priority"
      | "assigneeEmails"
      | "dueDate"
      | "calendarMessageId"
      | "calendarMonth"
      | "editingTaskId"
    >
  >,
): Promise<TelegramDraft | undefined> {
  const existing = await getTelegramDraft(chatId);
  if (!existing) return undefined;

  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const column = DRAFT_COLUMN[key];
    if (!column) continue;
    // Список исполнителей черновика хранится одной строкой через запятую.
    values.push(Array.isArray(value) ? value.join(",") : (value ?? null));
    sets.push(`${column} = $${values.length}`);
  }
  values.push(new Date(Date.now() + TELEGRAM_DRAFT_TTL_MS).toISOString());
  sets.push(`expires_at = $${values.length}`);
  sets.push("updated_at = now()");
  values.push(chatId);

  const pool = getPool();
  const res = await pool.query(
    `UPDATE telegram_drafts SET ${sets.join(", ")} WHERE chat_id = $${values.length} RETURNING *`,
    values,
  );
  if (res.rowCount === 0) return undefined;
  return rowToTelegramDraft(res.rows[0]);
}

export async function deleteTelegramDraft(chatId: string): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM telegram_drafts WHERE chat_id = $1", [chatId]);
}

// ---------- Google Calendar (OAuth-привязка личного календаря) ----------

function rowToGoogleCalendarLink(row: {
  email: string;
  access_token: string;
  refresh_token: string;
  expiry_date: string | number;
  connected_at: Date;
}): GoogleCalendarLink {
  return {
    email: row.email,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiryDate: Number(row.expiry_date),
    connectedAt: row.connected_at.toISOString(),
  };
}

export async function setGoogleCalendarLink(
  email: string,
  tokens: { accessToken: string; refreshToken: string; expiryDate: number },
): Promise<GoogleCalendarLink> {
  const pool = getPool();
  // Google присылает refresh_token только при первом согласии — если его
  // нет в ответе на обновление, оставляем прежний (COALESCE с NULLIF).
  const res = await pool.query(
    `INSERT INTO google_calendar_links (email, access_token, refresh_token, expiry_date)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET
       access_token = EXCLUDED.access_token,
       refresh_token = COALESCE(NULLIF(EXCLUDED.refresh_token, ''), google_calendar_links.refresh_token),
       expiry_date = EXCLUDED.expiry_date
     RETURNING *`,
    [email, tokens.accessToken, tokens.refreshToken, tokens.expiryDate],
  );
  return rowToGoogleCalendarLink(res.rows[0]);
}

export async function getGoogleCalendarLink(email: string): Promise<GoogleCalendarLink | undefined> {
  const pool = getPool();
  const res = await pool.query("SELECT * FROM google_calendar_links WHERE email = $1", [email]);
  if (res.rowCount === 0) return undefined;
  return rowToGoogleCalendarLink(res.rows[0]);
}

export async function deleteGoogleCalendarLink(email: string): Promise<void> {
  const pool = getPool();
  await pool.query("DELETE FROM google_calendar_links WHERE email = $1", [email]);
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
  const pool = getPool();
  const res = await pool.query(
    `INSERT INTO task_events (id, task_id, type, author_email, body, from_value, to_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      id("tevt"),
      input.taskId,
      input.type,
      input.authorEmail ?? null,
      input.body ?? null,
      input.fromValue ?? null,
      input.toValue ?? null,
    ],
  );
  return rowToTaskEvent(res.rows[0]);
}

export async function listTaskEvents(taskId: string): Promise<TaskEvent[]> {
  const pool = getPool();
  const res = await pool.query(
    "SELECT * FROM task_events WHERE task_id = $1 ORDER BY created_at ASC",
    [taskId],
  );
  return res.rows.map(rowToTaskEvent);
}

// ---------- Notifications (внутриприложенческий «колокольчик») ----------

export async function createNotification(input: {
  userEmail: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
}): Promise<Notification> {
  const pool = getPool();
  const res = await pool.query(
    `INSERT INTO notifications (id, user_email, type, title, body, link)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [id("notif"), input.userEmail, input.type, input.title, input.body, input.link ?? null],
  );
  return rowToNotification(res.rows[0]);
}

export async function listNotifications(userEmail: string, limit = 30): Promise<Notification[]> {
  const pool = getPool();
  const res = await pool.query(
    "SELECT * FROM notifications WHERE user_email = $1 ORDER BY created_at DESC LIMIT $2",
    [userEmail, limit],
  );
  return res.rows.map(rowToNotification);
}

export async function countUnreadNotifications(userEmail: string): Promise<number> {
  const pool = getPool();
  const res = await pool.query(
    "SELECT COUNT(*)::int AS count FROM notifications WHERE user_email = $1 AND read = false",
    [userEmail],
  );
  return res.rows[0]?.count ?? 0;
}

export async function markNotificationRead(notificationId: string, userEmail: string): Promise<void> {
  const pool = getPool();
  await pool.query("UPDATE notifications SET read = true WHERE id = $1 AND user_email = $2", [
    notificationId,
    userEmail,
  ]);
}

export async function markAllNotificationsRead(userEmail: string): Promise<void> {
  const pool = getPool();
  await pool.query("UPDATE notifications SET read = true WHERE user_email = $1", [userEmail]);
}

// ---------- Password reset (самостоятельный сброс через Telegram) ----------

const PASSWORD_RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export async function createPasswordResetToken(email: string): Promise<PasswordResetToken> {
  const pool = getPool();
  await pool.query("DELETE FROM password_reset_tokens WHERE email = $1", [email]);
  const token = id("pwreset");
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);
  const res = await pool.query<{ token: string; email: string; expires_at: Date; created_at: Date }>(
    `INSERT INTO password_reset_tokens (token, email, expires_at)
     VALUES ($1, $2, $3) RETURNING *`,
    [token, email, expiresAt.toISOString()],
  );
  const row = res.rows[0];
  return {
    token: row.token,
    email: row.email,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
  };
}

export async function consumePasswordResetToken(token: string): Promise<string | undefined> {
  const pool = getPool();
  const res = await pool.query<{ email: string; expires_at: Date }>(
    "DELETE FROM password_reset_tokens WHERE token = $1 RETURNING email, expires_at",
    [token],
  );
  if (res.rowCount === 0) return undefined;
  const row = res.rows[0];
  if (row.expires_at.getTime() < Date.now()) return undefined;
  return row.email;
}

// ---------- Мини-игры: доска рекордов ----------

function rowToGameScore(row: {
  id: string;
  workspace_id: string;
  game_id: string;
  user_email: string;
  score: number;
  created_at: Date;
  updated_at: Date;
}): GameScore {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    gameId: row.game_id as GameId,
    userEmail: row.user_email,
    score: row.score,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Сохраняет результат, только если он выше уже имеющегося (одна запись на пользователя+игру+пространство). */
export async function upsertGameScore(input: {
  workspaceId: string;
  gameId: GameId;
  userEmail: string;
  score: number;
}): Promise<GameScore> {
  const pool = getPool();
  const scoreId = id("score");
  const res = await pool.query(
    `INSERT INTO game_scores (id, workspace_id, game_id, user_email, score)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (workspace_id, game_id, user_email) DO UPDATE
       SET score = GREATEST(game_scores.score, EXCLUDED.score),
           updated_at = CASE WHEN EXCLUDED.score > game_scores.score THEN now() ELSE game_scores.updated_at END
     RETURNING *`,
    [scoreId, input.workspaceId, input.gameId, input.userEmail, input.score],
  );
  return rowToGameScore(res.rows[0]);
}

export async function listGameLeaderboard(
  workspaceId: string,
  gameId: GameId,
  limit = 10,
): Promise<GameScore[]> {
  const pool = getPool();
  const res = await pool.query(
    "SELECT * FROM game_scores WHERE workspace_id = $1 AND game_id = $2 ORDER BY score DESC LIMIT $3",
    [workspaceId, gameId, limit],
  );
  return res.rows.map(rowToGameScore);
}

// ---------- Seed ----------

export async function seedIfEmpty(): Promise<void> {
  const pool = getPool();
  const existing = await pool.query("SELECT 1 FROM users LIMIT 1");
  if ((existing.rowCount ?? 0) > 0) return;

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
      assigneeEmails: assignee ? [assignee] : [],
      dueDate: null,
    });
    await updateTask(t.id, { stage });
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
    assigneeEmails: [design.email],
    dueDate: null,
  });
  await updateTask(t1.id, { stage: "done" });
  await createTask({
    boardId: board2.id,
    title: "Прототип главной страницы",
    description: "",
    priority: "medium",
    assigneeEmails: [design.email],
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
