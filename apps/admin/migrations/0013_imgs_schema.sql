CREATE TABLE IF NOT EXISTS imgs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  active_id INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  image_url_card TEXT NOT NULL,
  title TEXT NULL,
  slug TEXT NULL UNIQUE,
  description TEXT NULL,
  style_tag_id INTEGER NULL,
  level_tag_id INTEGER NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (active_id) REFERENCES actives(id),
  FOREIGN KEY (style_tag_id) REFERENCES tags(id),
  FOREIGN KEY (level_tag_id) REFERENCES tags(id)
);

CREATE INDEX IF NOT EXISTS idx_imgs_category_active_sort
  ON imgs(category_id, active_id, is_active, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_imgs_active_sort
  ON imgs(active_id, is_active, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_imgs_category_active_style_level
  ON imgs(category_id, active_id, is_active, style_tag_id, level_tag_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_imgs_style
  ON imgs(style_tag_id, active_id, is_active, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_imgs_level
  ON imgs(level_tag_id, active_id, is_active, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_imgs_slug ON imgs(slug);
