ALTER TABLE practice_records ADD COLUMN time_centis INTEGER;

UPDATE practice_records
SET time_centis = CASE
  WHEN instr(time, ':') = 0 THEN CAST(ROUND(CAST(time AS REAL) * 100) AS INTEGER)
  ELSE CAST(substr(time, 1, instr(time, ':') - 1) AS INTEGER) * 6000
    + CAST(ROUND(CAST(substr(time, instr(time, ':') + 1) AS REAL) * 100) AS INTEGER)
END
WHERE time_centis IS NULL;

CREATE INDEX practice_records_lookup
ON practice_records(athlete_id, event, course, time_centis, date DESC);
