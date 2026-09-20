PRAGMA foreign_keys = ON;

CREATE TABLE watches (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  instruction TEXT NOT NULL,
  interval_minutes INTEGER NOT NULL DEFAULT 60 CHECK (interval_minutes >= 15),
  importance_threshold REAL NOT NULL DEFAULT 0.7 CHECK (importance_threshold >= 0 AND importance_threshold <= 1),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  next_run_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX watches_due_idx ON watches(enabled, next_run_at);

CREATE TABLE snapshots (
  id TEXT PRIMARY KEY,
  watch_id TEXT NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
  observed_at TEXT NOT NULL,
  final_url TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  content_type TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  truncated INTEGER NOT NULL DEFAULT 0 CHECK (truncated IN (0, 1)),
  etag TEXT,
  last_modified TEXT
);

CREATE INDEX snapshots_watch_time_idx ON snapshots(watch_id, observed_at DESC);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  watch_id TEXT NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
  snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
  previous_snapshot_id TEXT REFERENCES snapshots(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  importance REAL NOT NULL,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX events_watch_time_idx ON events(watch_id, created_at DESC);
CREATE INDEX events_time_idx ON events(created_at DESC);

CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  watch_id TEXT NOT NULL REFERENCES watches(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  duration_ms INTEGER,
  error TEXT
);

CREATE INDEX runs_watch_time_idx ON runs(watch_id, started_at DESC);
