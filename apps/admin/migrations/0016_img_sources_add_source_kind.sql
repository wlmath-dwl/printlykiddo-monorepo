ALTER TABLE img_sources
ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'outline';

UPDATE img_sources
SET source_kind = CASE
  WHEN lower(COALESCE(title, '')) LIKE '%color%'
    OR COALESCE(title, '') LIKE '%彩图%'
    OR COALESCE(title, '') LIKE '%彩色%'
  THEN 'color'
  ELSE 'outline'
END;
