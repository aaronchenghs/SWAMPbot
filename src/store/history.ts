import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const DB_PATH =
  process.env.HISTORY_DB || path.join(process.cwd(), 'data', 'history.sqlite');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('temp_store = MEMORY');
db.pragma('cache_size = -16000');

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

const insertMsg = db.prepare(
  'INSERT OR REPLACE INTO messages(id, chatId, authorId, authorName, createdAt, text, parentId) VALUES (@id,@chatId,@authorId,@authorName,@createdAt,@text,@parentId)',
);
const insertVec = db.prepare(
  'INSERT OR REPLACE INTO vectors(id, embedding) VALUES (?, ?)',
);

// micro-batched transaction
const insertBatch = db.transaction(
  (batch: Array<{ row: MsgRow; buf: Buffer }>) => {
    for (const { row, buf } of batch) {
      insertMsg.run(row);
      insertVec.run(row.id, buf);
    }
  },
);

// simple write queue
type Pending = { row: MsgRow; buf: Buffer };
const queue: Pending[] = [];
const MAX_BATCH = 25;
const FLUSH_MS = 120;
const MAX_QUEUE = 1000;

function flush() {
  if (!queue.length) return;
  const batch = queue.splice(0, MAX_BATCH);
  try {
    insertBatch(batch);
  } catch (e) {
    console.error('DB batch insert failed', e);
  }
}
setInterval(flush, FLUSH_MS).unref();

export function addMessage(row: MsgRow, embedding: number[]) {
  // Convert to zero-length blob if empty (keeps NOT NULL happy)
  const buf =
    embedding && embedding.length
      ? Buffer.from(Float32Array.from(embedding).buffer)
      : Buffer.alloc(0);

  if (queue.length >= MAX_QUEUE) {
    // shed some load: drop older half of queue (messages still came through live)
    queue.splice(0, Math.floor(queue.length / 2));
  }
  queue.push({ row, buf });
}

export function recentInChat(chatId: string, sinceMs: number): MsgRow[] {
  const stmt = db.prepare(
    'SELECT * FROM messages WHERE chatId=? AND createdAt>=? ORDER BY createdAt DESC LIMIT 1000',
  );
  return stmt.all(chatId, sinceMs) as MsgRow[];
}
