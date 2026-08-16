ALTER TABLE practice_records ADD COLUMN rt_centis INTEGER;

CREATE TABLE practice_splits (
  id TEXT PRIMARY KEY,
  practice_record_id TEXT NOT NULL REFERENCES practice_records(id) ON DELETE CASCADE,
  distance_m INTEGER NOT NULL CHECK(distance_m > 0),
  time_centis INTEGER NOT NULL CHECK(time_centis > 0),
  UNIQUE(practice_record_id, distance_m)
);

CREATE INDEX practice_splits_record_distance
ON practice_splits(practice_record_id, distance_m);
