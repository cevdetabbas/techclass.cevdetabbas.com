import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashSessionToken } from "./auth.js";
import { defaultSchedule, normalizeSchedule } from "./assistant.js";

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "techclass.sqlite");
let db;

function nowIso() {
  return new Date().toISOString();
}

function asJson(value) {
  return JSON.stringify(value);
}

function fromJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function initDb() {
  fs.mkdirSync(dataDir, { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      google_sub TEXT,
      avatar_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      title TEXT NOT NULL,
      timezone TEXT NOT NULL,
      blocks_json TEXT NOT NULL,
      theme_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assistant_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  migrateUsersTable();
  migrateSchedulesTable();
}

function database() {
  if (!db) {
    initDb();
  }
  return db;
}

function hasColumn(table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

function migrateUsersTable() {
  if (!hasColumn("users", "google_sub")) {
    db.exec("ALTER TABLE users ADD COLUMN google_sub TEXT");
  }
  if (!hasColumn("users", "avatar_url")) {
    db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT");
  }
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL");
}

function migrateSchedulesTable() {
  if (!hasColumn("schedules", "week_json")) {
    db.exec("ALTER TABLE schedules ADD COLUMN week_json TEXT");
  }
}

export function createUser({ name, email, passwordHash }) {
  const createdAt = nowIso();
  const result = database()
    .prepare("INSERT INTO users (name, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
    .run(name, email, passwordHash, createdAt, createdAt);
  const user = getUserById(Number(result.lastInsertRowid));
  saveSchedule(user.id, defaultSchedule(`${name}'s TechClass`));
  return user;
}

export function getUserByEmail(email) {
  return database()
    .prepare("SELECT id, name, email, password_hash, google_sub, avatar_url, created_at, updated_at FROM users WHERE email = ?")
    .get(email) || null;
}

export function getUserById(id) {
  return database()
    .prepare("SELECT id, name, email, password_hash, google_sub, avatar_url, created_at, updated_at FROM users WHERE id = ?")
    .get(id) || null;
}

export function getUserByGoogleSub(googleSub) {
  return database()
    .prepare("SELECT id, name, email, password_hash, google_sub, avatar_url, created_at, updated_at FROM users WHERE google_sub = ?")
    .get(googleSub) || null;
}

export function createOrUpdateGoogleUser({ googleSub, email, name, avatarUrl }) {
  const existingGoogleUser = getUserByGoogleSub(googleSub);
  const timestamp = nowIso();
  if (existingGoogleUser) {
    const emailOwner = getUserByEmail(email);
    if (emailOwner && emailOwner.id !== existingGoogleUser.id) {
      throw new Error("That Google email belongs to another TechClass account.");
    }
    database()
      .prepare("UPDATE users SET name = ?, email = ?, avatar_url = ?, updated_at = ? WHERE id = ?")
      .run(name, email, avatarUrl, timestamp, existingGoogleUser.id);
    return getUserById(existingGoogleUser.id);
  }

  const existingEmailUser = getUserByEmail(email);
  if (existingEmailUser) {
    if (existingEmailUser.google_sub && existingEmailUser.google_sub !== googleSub) {
      throw new Error("That TechClass account is already linked to another Google account.");
    }
    database()
      .prepare("UPDATE users SET google_sub = ?, avatar_url = ?, updated_at = ? WHERE id = ?")
      .run(googleSub, avatarUrl, timestamp, existingEmailUser.id);
    return getUserById(existingEmailUser.id);
  }

  const result = database()
    .prepare("INSERT INTO users (name, email, password_hash, google_sub, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(name, email, `google$${googleSub}`, googleSub, avatarUrl, timestamp, timestamp);
  const user = getUserById(Number(result.lastInsertRowid));
  saveSchedule(user.id, defaultSchedule(`${name}'s TechClass`));
  return user;
}

export function createSession({ userId, token, maxAgeSeconds }) {
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString();
  database()
    .prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(hashSessionToken(token), userId, expiresAt, createdAt);
}

export function refreshSession(token, maxAgeSeconds) {
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000).toISOString();
  database()
    .prepare("UPDATE sessions SET expires_at = ? WHERE token_hash = ?")
    .run(expiresAt, hashSessionToken(token));
}

export function getSessionByToken(token) {
  const tokenHash = hashSessionToken(token);
  const row = database()
    .prepare("SELECT token_hash, user_id, expires_at, created_at FROM sessions WHERE token_hash = ?")
    .get(tokenHash);
  if (!row) {
    return null;
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    deleteSession(token);
    return null;
  }
  return row;
}

export function deleteSession(token) {
  database().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashSessionToken(token));
}

export function deleteExpiredSessions() {
  database().prepare("DELETE FROM sessions WHERE expires_at <= ?").run(nowIso());
}

export function getSchedule(userId) {
  const row = database()
    .prepare("SELECT title, timezone, blocks_json, theme_json, week_json, updated_at FROM schedules WHERE user_id = ?")
    .get(userId);
  if (!row) {
    const schedule = defaultSchedule("My TechClass");
    saveSchedule(userId, schedule);
    return schedule;
  }
  return normalizeSchedule({
    title: row.title,
    timezone: row.timezone,
    blocks: fromJson(row.blocks_json, []),
    theme: fromJson(row.theme_json, {}),
    week: fromJson(row.week_json, null),
    updatedAt: row.updated_at,
  });
}

export function saveSchedule(userId, scheduleInput) {
  const schedule = normalizeSchedule(scheduleInput);
  const timestamp = nowIso();
  database()
    .prepare(`
      INSERT INTO schedules (user_id, title, timezone, blocks_json, theme_json, week_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        title = excluded.title,
        timezone = excluded.timezone,
        blocks_json = excluded.blocks_json,
        theme_json = excluded.theme_json,
        week_json = excluded.week_json,
        updated_at = excluded.updated_at
    `)
    .run(
      userId,
      schedule.title,
      schedule.timezone,
      asJson(schedule.blocks),
      asJson(schedule.theme),
      asJson(schedule.week),
      timestamp,
      timestamp,
    );
  return schedule;
}

export function saveAssistantMessage(userId, role, content) {
  database()
    .prepare("INSERT INTO assistant_messages (user_id, role, content, created_at) VALUES (?, ?, ?, ?)")
    .run(userId, role, content.slice(0, 4000), nowIso());
}

export function getAssistantMessages(userId) {
  return database()
    .prepare("SELECT role, content, created_at FROM assistant_messages WHERE user_id = ? ORDER BY id DESC LIMIT 30")
    .all(userId)
    .reverse();
}
