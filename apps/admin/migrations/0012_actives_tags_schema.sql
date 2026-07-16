DROP TABLE IF EXISTS active_tags;
DROP TABLE IF EXISTS active_categories;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS actives;
DROP TABLE IF EXISTS images;
DROP TABLE IF EXISTS dimensions;
DROP TABLE IF EXISTS functions;

CREATE TABLE IF NOT EXISTS actives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  keywords TEXT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NULL,
  type TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS active_categories (
  active_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  PRIMARY KEY (active_id, category_id),
  FOREIGN KEY (active_id) REFERENCES actives(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS active_tags (
  active_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (active_id, tag_id),
  FOREIGN KEY (active_id) REFERENCES actives(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_actives_sort_order ON actives(sort_order);
CREATE INDEX IF NOT EXISTS idx_tags_type ON tags(type);
CREATE INDEX IF NOT EXISTS idx_tags_sort_order ON tags(sort_order);
CREATE INDEX IF NOT EXISTS idx_active_categories_category_id ON active_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_active_tags_tag_id ON active_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_active_tags_sort_order ON active_tags(active_id, sort_order, tag_id);
