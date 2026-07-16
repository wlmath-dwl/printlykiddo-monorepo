ALTER TABLE imgs ADD COLUMN difficulty INTEGER NULL;

CREATE INDEX IF NOT EXISTS idx_imgs_category_active_difficulty_sort
  ON imgs(category_id, active_id, is_active, difficulty, sort_order, id);
