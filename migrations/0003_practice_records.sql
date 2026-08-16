CREATE TABLE practice_records (
  id TEXT PRIMARY KEY,
  athlete_id TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  event TEXT NOT NULL,
  course TEXT NOT NULL CHECK(course IN ('SCM','LCM')),
  time TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX practice_records_athlete_date ON practice_records(athlete_id, date DESC, created_at DESC);
