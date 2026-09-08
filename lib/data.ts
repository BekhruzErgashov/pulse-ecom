import "server-only";
import { isDatabaseAvailable } from "@/lib/db";
import * as memoryStore from "@/lib/store-memory";
import * as dbStore from "@/lib/store-db";

/**
 * Единая точка доступа к данным. Все API-роуты и страницы импортируют
 * функции отсюда, а не напрямую из store-memory/store-db — поэтому
 * переключение на настоящую БД происходит только через переменную
 * окружения DATABASE_URL, без правок в остальном коде.
 */
const impl = isDatabaseAvailable() ? dbStore : memoryStore;

// Allowlist
export const isEmailAllowed = impl.isEmailAllowed;
export const listAllowedEmails = impl.listAllowedEmails;
export const addAllowedEmail = impl.addAllowedEmail;
export const removeAllowedEmail = impl.removeAllowedEmail;

// Users / auth
export const registerUser = impl.registerUser;
export const verifyLogin = impl.verifyLogin;
export const getUserByEmail = impl.getUserByEmail;
export const listUsers = impl.listUsers;
export const updateUser = impl.updateUser;
export const countAdmins = impl.countAdmins;
export const resetUserPassword = impl.resetUserPassword;
export const changeOwnPassword = impl.changeOwnPassword;
export const deleteUser = impl.deleteUser;

// Workspaces
export const createWorkspace = impl.createWorkspace;
export const listWorkspaces = impl.listWorkspaces;
export const listWorkspacesForUser = impl.listWorkspacesForUser;
export const getWorkspace = impl.getWorkspace;
export const isWorkspaceMember = impl.isWorkspaceMember;
export const listWorkspaceMemberEmails = impl.listWorkspaceMemberEmails;
export const addWorkspaceMember = impl.addWorkspaceMember;
export const removeWorkspaceMember = impl.removeWorkspaceMember;
export const inviteWorkspaceMember = impl.inviteWorkspaceMember;
export const listPendingInvites = impl.listPendingInvites;
export const removePendingInvite = impl.removePendingInvite;

// Boards
export const createBoard = impl.createBoard;
export const listBoards = impl.listBoards;
export const getBoard = impl.getBoard;
export const deleteBoard = impl.deleteBoard;
export const addBoardMember = impl.addBoardMember;
export const updateBoard = impl.updateBoard;

// Tasks
export const createTask = impl.createTask;
export const listTasksByBoard = impl.listTasksByBoard;
export const listMyTasksInWorkspace = impl.listMyTasksInWorkspace;
export const getTask = impl.getTask;
export const updateTask = impl.updateTask;
export const deleteTask = impl.deleteTask;

// Task attachments (скриншоты)
export const addTaskAttachment = impl.addTaskAttachment;
export const listTaskAttachments = impl.listTaskAttachments;
export const countTaskAttachments = impl.countTaskAttachments;
export const getTaskAttachment = impl.getTaskAttachment;
export const deleteTaskAttachment = impl.deleteTaskAttachment;

// Questions
export const createQuestion = impl.createQuestion;
export const listQuestionsForUser = impl.listQuestionsForUser;
export const getQuestion = impl.getQuestion;
export const updateQuestionStatus = impl.updateQuestionStatus;
export const createMessage = impl.createMessage;
export const listMessages = impl.listMessages;

export const seedIfEmpty = impl.seedIfEmpty;

// Notes (личные, видны только владельцу)
export const createNoteFolder = impl.createNoteFolder;
export const listNoteFolders = impl.listNoteFolders;
export const deleteNoteFolder = impl.deleteNoteFolder;
export const createNote = impl.createNote;
export const listNotes = impl.listNotes;
export const getNote = impl.getNote;
export const updateNote = impl.updateNote;
export const deleteNote = impl.deleteNote;

// Work links (рабочие ссылки)
export const createWorkLink = impl.createWorkLink;
export const listWorkLinks = impl.listWorkLinks;
export const getWorkLink = impl.getWorkLink;
export const deleteWorkLink = impl.deleteWorkLink;

// Telegram (привязка аккаунта к боту, уведомления)
export const createTelegramLinkToken = impl.createTelegramLinkToken;
export const consumeTelegramLinkToken = impl.consumeTelegramLinkToken;
export const setTelegramLink = impl.setTelegramLink;
export const getTelegramLinkByEmail = impl.getTelegramLinkByEmail;
export const getTelegramLinkByChatId = impl.getTelegramLinkByChatId;
export const listTelegramLinks = impl.listTelegramLinks;
export const deleteTelegramLink = impl.deleteTelegramLink;
export const updateTelegramNotifyPref = impl.updateTelegramNotifyPref;
export const updateTelegramDigestHour = impl.updateTelegramDigestHour;

// Telegram: черновики задач пошагового диалога /newtask
export const startTelegramDraft = impl.startTelegramDraft;
export const getTelegramDraft = impl.getTelegramDraft;
export const updateTelegramDraft = impl.updateTelegramDraft;
export const deleteTelegramDraft = impl.deleteTelegramDraft;

// Google Calendar (OAuth-привязка личного календаря)
export const setGoogleCalendarLink = impl.setGoogleCalendarLink;
export const getGoogleCalendarLink = impl.getGoogleCalendarLink;
export const deleteGoogleCalendarLink = impl.deleteGoogleCalendarLink;

// Task events (комментарии + автолог изменений задачи)
export const createTaskEvent = impl.createTaskEvent;
export const listTaskEvents = impl.listTaskEvents;

// Notifications (внутриприложенческий «колокольчик»)
export const createNotification = impl.createNotification;
export const listNotifications = impl.listNotifications;
export const countUnreadNotifications = impl.countUnreadNotifications;
export const markNotificationRead = impl.markNotificationRead;
export const markAllNotificationsRead = impl.markAllNotificationsRead;

// Password reset (самостоятельный сброс через Telegram)
export const createPasswordResetToken = impl.createPasswordResetToken;
export const consumePasswordResetToken = impl.consumePasswordResetToken;

// Мини-игры (доска рекордов)
export const upsertGameScore = impl.upsertGameScore;
export const listGameLeaderboard = impl.listGameLeaderboard;
