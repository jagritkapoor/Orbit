CREATE TABLE IF NOT EXISTS notes (
  id          TEXT    PRIMARY KEY,
  content     TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_created_at ON notes(created_at DESC);

CREATE TABLE IF NOT EXISTS timers (
  id               TEXT    PRIMARY KEY,
  note_id          TEXT    NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  section_index    INTEGER NOT NULL,
  timer_type       TEXT    NOT NULL,  -- 'countdown' | 'pomo'
  duration_seconds INTEGER NOT NULL,
  remaining_seconds INTEGER NOT NULL,
  state            TEXT    NOT NULL DEFAULT 'idle',  -- 'idle' | 'running' | 'paused' | 'done'
  pomo_cycle       INTEGER NOT NULL DEFAULT 0,
  started_at       INTEGER,
  UNIQUE(note_id, section_index)
);

CREATE TABLE IF NOT EXISTS list_items (
  id            TEXT    PRIMARY KEY,
  note_id       TEXT    NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  section_index INTEGER NOT NULL,
  content       TEXT    NOT NULL,
  occurrence    INTEGER NOT NULL DEFAULT 0,
  checked       INTEGER NOT NULL DEFAULT 0,  -- 0 = false, 1 = true
  UNIQUE(note_id, section_index, content, occurrence)
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('theme', 'auto'),
  ('font_size', '14'),
  ('pomo_work_minutes', '25'),
  ('pomo_break_minutes', '5'),
  ('currency_base', 'USD'),
  ('currency_rates_updated_at', '0');
