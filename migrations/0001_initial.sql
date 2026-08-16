-- D1 schema: timestamps are ISO-8601 UTC text for SQLite portability.
PRAGMA foreign_keys = ON;
CREATE TABLE athletes (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, gender TEXT NOT NULL CHECK(gender IN ('male','female','other')),
  birth_date TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE races (
  id TEXT PRIMARY KEY, athlete_id TEXT NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  race_date TEXT NOT NULL, meet_name TEXT NOT NULL, course TEXT NOT NULL CHECK(course IN ('SCM','LCM')),
  event TEXT NOT NULL, record_centis INTEGER NOT NULL CHECK(record_centis > 0), rt_centis INTEGER,
  rank INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX races_lookup ON races(athlete_id, event, course, record_centis);
CREATE TABLE splits (
  id TEXT PRIMARY KEY, race_id TEXT NOT NULL REFERENCES races(id) ON DELETE CASCADE,
  leg_number INTEGER NOT NULL CHECK(leg_number > 0), distance_m INTEGER NOT NULL, time_centis INTEGER NOT NULL,
  UNIQUE(race_id, leg_number)
);
CREATE TABLE qualification_standards (
  id TEXT PRIMARY KEY, system TEXT NOT NULL CHECK(system IN ('grade','JO')), gender TEXT NOT NULL,
  min_age INTEGER NOT NULL, max_age INTEGER NOT NULL, course TEXT NOT NULL, event TEXT NOT NULL,
  label TEXT NOT NULL, target_centis INTEGER NOT NULL
);
