CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS dimensions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_category_id INTEGER NOT NULL,
  second_category_id INTEGER NULL,
  dimension1_id INTEGER NOT NULL,
  dimension2_id INTEGER NOT NULL,
  feature TEXT NULL,
  image_r2_path TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (first_category_id) REFERENCES categories(id),
  FOREIGN KEY (second_category_id) REFERENCES categories(id),
  FOREIGN KEY (dimension1_id) REFERENCES dimensions(id),
  FOREIGN KEY (dimension2_id) REFERENCES dimensions(id)
);

CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);
CREATE INDEX IF NOT EXISTS idx_dimensions_type ON dimensions(type);
CREATE INDEX IF NOT EXISTS idx_dimensions_sort_order ON dimensions(sort_order);
CREATE INDEX IF NOT EXISTS idx_images_first_category_id ON images(first_category_id);
CREATE INDEX IF NOT EXISTS idx_images_second_category_id ON images(second_category_id);
CREATE INDEX IF NOT EXISTS idx_images_dimension1_id ON images(dimension1_id);
CREATE INDEX IF NOT EXISTS idx_images_dimension2_id ON images(dimension2_id);
