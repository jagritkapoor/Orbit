import Database from "@tauri-apps/plugin-sql";
import type { Note, ListItemRow, TimerRow } from "../types";

const DB_PATH = "sqlite:orbit.db";

let _db: Database | null = null;
let _dbPromise: Promise<Database> | null = null;

async function getDb(): Promise<Database> {
  if (_db) return _db;
  if (!_dbPromise) {
    _dbPromise = Database.load(DB_PATH).then((db) => {
      _db = db;
      return db;
    });
  }
  return _dbPromise;
}

export async function getAllNotes(): Promise<Note[]> {
  const db = await getDb();
  return db.select<Note[]>("SELECT * FROM notes ORDER BY updated_at DESC");
}

export async function getNoteById(id: string): Promise<Note | null> {
  const db = await getDb();
  const rows = await db.select<Note[]>("SELECT * FROM notes WHERE id = $1", [id]);
  return rows[0] ?? null;
}

export async function createNote(note: Note): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO notes (id, content, created_at, updated_at) VALUES ($1, $2, $3, $4)",
    [note.id, note.content, note.created_at, note.updated_at]
  );
}

export async function updateNoteContent(id: string, content: string, updated_at: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE notes SET content = $1, updated_at = $2 WHERE id = $3",
    [content, updated_at, id]
  );
}

export async function deleteEmptyNotes(): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM notes WHERE trim(content) = ''");
}

export async function deleteNote(id: string): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM notes WHERE id = $1", [id]);
}

export async function getListItemsForNote(noteId: string): Promise<ListItemRow[]> {
  const db = await getDb();
  const rows = await db.select<{ id: string; section_index: number; content: string; occurrence: number; checked: number }[]>(
    "SELECT id, section_index, content, occurrence, checked FROM list_items WHERE note_id = $1",
    [noteId]
  );
  return rows.map((r) => ({
    id: r.id,
    note_id: noteId,
    section_index: r.section_index,
    content: r.content,
    occurrence: r.occurrence,
    checked: r.checked === 1,
  }));
}

export async function setListItem(
  id: string,
  noteId: string,
  sectionIndex: number,
  content: string,
  occurrence: number,
  checked: boolean
): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO list_items (id, note_id, section_index, content, occurrence, checked)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT(note_id, section_index, content, occurrence)
     DO UPDATE SET checked = excluded.checked`,
    [id, noteId, sectionIndex, content, occurrence, checked ? 1 : 0]
  );
}

export async function getAllTimers(): Promise<TimerRow[]> {
  const db = await getDb();
  return db.select<TimerRow[]>("SELECT * FROM timers");
}

export async function upsertTimer(t: TimerRow): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO timers (id, note_id, section_index, timer_type, duration_seconds, remaining_seconds, state, pomo_cycle, started_at, phase)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT(note_id, section_index) DO UPDATE SET
       timer_type = excluded.timer_type,
       duration_seconds = excluded.duration_seconds,
       remaining_seconds = excluded.remaining_seconds,
       state = excluded.state,
       pomo_cycle = excluded.pomo_cycle,
       started_at = excluded.started_at,
       phase = excluded.phase`,
    [t.id, t.note_id, t.section_index, t.timer_type, t.duration_seconds,
     t.remaining_seconds, t.state, t.pomo_cycle, t.started_at, t.phase]
  );
}

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.select<{ value: string }[]>(
    "SELECT value FROM settings WHERE key = $1",
    [key]
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value]
  );
}
