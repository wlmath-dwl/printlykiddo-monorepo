ALTER TABLE imgs ADD COLUMN image_url_card TEXT NULL;

UPDATE imgs
SET image_url_card = image_url
WHERE image_url_card IS NULL;
