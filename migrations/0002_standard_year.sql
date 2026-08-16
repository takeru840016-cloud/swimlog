-- Apply after 0001_initial.sql.  A standard can coexist across multiple effective years.
ALTER TABLE qualification_standards ADD COLUMN effective_year INTEGER NOT NULL DEFAULT 2025;
CREATE INDEX qualification_standards_year_lookup ON qualification_standards(effective_year, system, gender, course, event);
