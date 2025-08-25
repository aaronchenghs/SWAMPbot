import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH =
  process.env.HISTORY_DB || path.join(process.cwd(), 'data', 'history.sqlite');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  chatId TEXT NOT NULL,
  authorId TEXT,
  authorName TEXT,
  createdAt INTEGER NOT NULL,
  text TEXT NOT NULL,
  parentId TEXT
);
CREATE TABLE IF NOT EXISTS vectors (
  id TEXT PRIMARY KEY,
  embedding BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_chat_time ON messages(chatId, createdAt);
CREATE INDEX IF NOT EXISTS idx_msg_parent ON messages(parentId);
`);

export type MsgRow = {
  id: string;
  chatId: string;
  authorId?: string;
  authorName?: string;
  createdAt: number;
  text: string;
  parentId?: string | null;
};

export function addMessage(row: MsgRow, embedding: number[]) {
  const insertMsg = db.prepare(
    'INSERT OR REPLACE INTO messages(id, chatId, authorId, authorName, createdAt, text, parentId) VALUES (@id,@chatId,@authorId,@authorName,@createdAt,@text,@parentId)',
  );
  insertMsg.run(row);
  const buf = Buffer.from(Float32Array.from(embedding).buffer);
  const insertVec = db.prepare(
    'INSERT OR REPLACE INTO vectors(id, embedding) VALUES (?, ?)',
  );
  insertVec.run(row.id, buf);
}

export function recentInChat(chatId: string, sinceMs: number): MsgRow[] {
  const stmt = db.prepare(
    'SELECT * FROM messages WHERE chatId=? AND createdAt>=? ORDER BY createdAt DESC LIMIT 1000',
  );
  return stmt.all(chatId, sinceMs) as MsgRow[];
}
