export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS allowed_emails (
  email TEXT PRIMARY KEY,
  added_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  password_hash TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- На случай, если таблица users уже существует с более ранней версии схемы.
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(email),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL REFERENCES users(email),
  PRIMARY KEY (workspace_id, email)
);

CREATE TABLE IF NOT EXISTS workspace_invites (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, email)
);

CREATE TABLE IF NOT EXISTS boards (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_email TEXT NOT NULL REFERENCES users(email),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- На случай, если таблица boards уже существует без пространств.
ALTER TABLE boards ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS board_members (
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  email TEXT NOT NULL REFERENCES users(email),
  PRIMARY KEY (board_id, email)
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  board_id TEXT NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  stage TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'medium',
  kind TEXT NOT NULL DEFAULT 'normal',
  target_count INTEGER,
  found_count INTEGER,
  assignee_email TEXT REFERENCES users(email),
  due_date TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS target_count INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS found_count INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS result_note TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_by TEXT REFERENCES users(email);

-- Архив задач: обратимая альтернатива удалению. Заполненный archived_at
-- убирает задачу из обычных списков доски, но сохраняет её со всей историей.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS tasks_board_archived_idx ON tasks(board_id, archived_at);

-- Когда задача в последний раз перешла в «Готово» — источник истины для
-- недельного архивирования на длительных досках (см. lib/week.ts). Бэкфилл
-- ниже проставляет её по updated_at для уже готовых задач, созданных до
-- этой колонки, чтобы они не пропали молча из текущей недели.
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
UPDATE tasks SET completed_at = updated_at WHERE stage = 'done' AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS tasks_board_id_idx ON tasks(board_id);

-- Скриншоты/вложения к задачам. Хранятся как base64 прямо в Postgres
-- (без отдельного файлового хранилища) — прикреплять может и создатель,
-- и исполнитель задачи (проверяется в API), лимиты (размер/кол-во файлов)
-- тоже enforced в API, не в схеме.
CREATE TABLE IF NOT EXISTS task_attachments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  uploaded_by TEXT REFERENCES users(email),
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_attachments_task_id_idx ON task_attachments(task_id);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  author_email TEXT REFERENCES users(email),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE questions ALTER COLUMN author_email DROP NOT NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS question_recipients (
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  email TEXT NOT NULL REFERENCES users(email),
  PRIMARY KEY (question_id, email)
);

CREATE TABLE IF NOT EXISTS question_messages (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  author_email TEXT REFERENCES users(email),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE question_messages ALTER COLUMN author_email DROP NOT NULL;

CREATE INDEX IF NOT EXISTS question_messages_question_id_idx ON question_messages(question_id);
CREATE INDEX IF NOT EXISTS question_recipients_email_idx ON question_recipients(email);

CREATE TABLE IF NOT EXISTS note_folders (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL REFERENCES users(email),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL REFERENCES users(email),
  folder_id TEXT REFERENCES note_folders(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notes_owner_email_idx ON notes(owner_email);
CREATE INDEX IF NOT EXISTS note_folders_owner_email_idx ON note_folders(owner_email);

-- Рабочие ссылки (вкладка «Ссылки») — общий для всех участников
-- пространства список внешних сервисов (добавляет/удаляет любой участник).
CREATE TABLE IF NOT EXISTS work_links (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(email),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS work_links_workspace_id_idx ON work_links(workspace_id);

-- Привязка аккаунта к чату Telegram-бота — один чат на пользователя,
-- используется для уведомлений и быстрых команд из бота.
CREATE TABLE IF NOT EXISTS telegram_links (
  email TEXT PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
  chat_id TEXT NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_links_chat_id_idx ON telegram_links(chat_id);

-- Ник пользователя в Telegram (для отображения «привязано как @ник») и
-- персональные настройки уведомлений/времени дайджеста.
ALTER TABLE telegram_links ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE telegram_links ADD COLUMN IF NOT EXISTS notify_task_assigned BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE telegram_links ADD COLUMN IF NOT EXISTS notify_comments BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE telegram_links ADD COLUMN IF NOT EXISTS notify_stage_changes BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE telegram_links ADD COLUMN IF NOT EXISTS notify_task_deleted BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE telegram_links ADD COLUMN IF NOT EXISTS notify_questions BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE telegram_links ADD COLUMN IF NOT EXISTS notify_digest BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE telegram_links ADD COLUMN IF NOT EXISTS digest_hour_utc INTEGER NOT NULL DEFAULT 4;

-- Одноразовые токены для диплинка t.me/<bot>?start=<token>, которым
-- пользователь подтверждает привязку своего аккаунта к чату бота.
CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Черновик задачи, которую пользователь собирает пошагово в Telegram
-- (/newtask). Состояние диалога нельзя держать в памяти процесса: на Vercel
-- каждый апдейт бота может обработать свой экземпляр serverless-функции.
-- Одна активная запись на чат, протухшие чистятся при следующем /newtask.
CREATE TABLE IF NOT EXISTS telegram_drafts (
  chat_id TEXT PRIMARY KEY,
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  step TEXT NOT NULL,
  workspace_id TEXT,
  board_id TEXT,
  title TEXT,
  assignee_email TEXT,
  due_date TEXT,
  calendar_message_id BIGINT,
  calendar_month TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Комментарии и автолог изменений задачи (единая хронологическая лента,
-- как в issue-трекерах — комментарии и системные записи вперемешку).
CREATE TABLE IF NOT EXISTS task_events (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  author_email TEXT REFERENCES users(email),
  body TEXT,
  from_value TEXT,
  to_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_events_task_id_idx ON task_events(task_id);

-- Внутриприложенческие уведомления («колокольчик») — параллельно Telegram,
-- не требуют привязки бота.
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  link TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_email_idx ON notifications(user_email, created_at DESC);

-- Одноразовые токены самостоятельного сброса пароля (диплинк присылается в Telegram).
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- OAuth-привязка личного Google-календаря — один Google-аккаунт на
-- пользователя приложения. refresh_token нужен, чтобы молча обновлять
-- access_token, когда он истекает (expiry_date).
CREATE TABLE IF NOT EXISTS google_calendar_links (
  email TEXT PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expiry_date BIGINT NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Доска рекордов мини-игр — одна строка на (пространство, игра,
-- пользователь), хранит только личный рекорд (апдейт только если новый
-- результат выше). game_id — свободный текст на стороне кода
-- ("dino"/"samurai"), не enum, чтобы новые игры не требовали миграции.
CREATE TABLE IF NOT EXISTS game_scores (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL,
  user_email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, game_id, user_email)
);

CREATE INDEX IF NOT EXISTS game_scores_leaderboard_idx ON game_scores(workspace_id, game_id, score DESC);

-- Бэкфилл: у существующих (созданных до пространств) досок/вопросов нет
-- workspace_id. Создаём пространство по умолчанию, переносим туда старые
-- доски, вопросы и всех существующих пользователей — чтобы ничего не
-- потерялось при обновлении.
DO $$
DECLARE
  default_owner TEXT;
  ws_id TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM boards WHERE workspace_id IS NULL)
     OR EXISTS (SELECT 1 FROM questions WHERE workspace_id IS NULL) THEN
    SELECT email INTO default_owner FROM users ORDER BY created_at ASC LIMIT 1;
    IF default_owner IS NOT NULL THEN
      SELECT id INTO ws_id FROM workspaces WHERE created_by = default_owner ORDER BY created_at ASC LIMIT 1;
      IF ws_id IS NULL THEN
        ws_id := 'ws_default_' || substr(md5(random()::text), 1, 10);
        INSERT INTO workspaces (id, name, created_by) VALUES (ws_id, 'Основная команда', default_owner);
      END IF;
      UPDATE boards SET workspace_id = ws_id WHERE workspace_id IS NULL;
      UPDATE questions SET workspace_id = ws_id WHERE workspace_id IS NULL;
      INSERT INTO workspace_members (workspace_id, email)
        SELECT ws_id, email FROM users
        ON CONFLICT DO NOTHING;
    END IF;
  END IF;
END $$;
`;
