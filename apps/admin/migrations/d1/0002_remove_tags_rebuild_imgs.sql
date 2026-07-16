-- 去掉 tags / active_tags 相关设计：先重建 imgs（去掉 style_tag_id / level_tag_id 及对外键），再删标签表。
-- 顺序避免在 imgs 仍引用 tags 时 DROP tags 失败。

DROP INDEX IF EXISTS idx_imgs_category_active_style_level;
DROP INDEX IF EXISTS idx_imgs_style;
DROP INDEX IF EXISTS idx_imgs_level;

ALTER TABLE imgs RENAME TO imgs__old;

CREATE TABLE imgs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  active_id INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  image_url_card TEXT NOT NULL,
  title TEXT NULL,
  slug TEXT NULL UNIQUE,
  description TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (active_id) REFERENCES actives(id)
);

INSERT INTO imgs (
  id,
  category_id,
  active_id,
  image_url,
  image_url_card,
  title,
  slug,
  description,
  sort_order,
  is_active,
  created_at,
  updated_at
)
SELECT
  id,
  category_id,
  active_id,
  image_url,
  image_url_card,
  title,
  slug,
  description,
  sort_order,
  is_active,
  created_at,
  updated_at
FROM imgs__old;

DROP TABLE imgs__old;

CREATE INDEX IF NOT EXISTS idx_imgs_category_active_sort
  ON imgs(category_id, active_id, is_active, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_imgs_active_sort
  ON imgs(active_id, is_active, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_imgs_slug ON imgs(slug);

DROP TABLE IF EXISTS active_tags;
DROP TABLE IF EXISTS tags;
