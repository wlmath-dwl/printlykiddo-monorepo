/**
 * 一次性：给 Animals / 动物 新增 Amphibians / 两栖动物 二级分类。
 *
 * - Tree Frog、Axolotl 迁入 Amphibians
 * - 新增候选两栖动物默认 is_active = 0
 *
 * 在 printly-admin 目录执行：
 *   node scripts/apply-animals-amphibians-expansion.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");

const amphibians = {
  slug: "amphibians",
  name: "Amphibians",
  nameZh: "两栖动物",
  sortOrder: 12,
  isActive: 1,
  activeItems: ["tree-frog"],
  inactiveItems: [
    ["Axolotl", "美西螈", "axolotl"],
    ["Frog", "青蛙", "frog"],
    ["Toad", "蟾蜍", "toad"],
    ["Salamander", "蝾螈", "salamander"],
    ["Newt", "水螈", "newt"],
    ["Poison Dart Frog", "箭毒蛙", "poison-dart-frog"],
    ["Red-Eyed Tree Frog", "红眼树蛙", "red-eyed-tree-frog"],
    ["Fire Salamander", "火蝾螈", "fire-salamander"],
  ],
};

function nowIso() {
  return new Date().toISOString();
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const ts = nowIso();
const getBySlug = db.prepare(
  "SELECT * FROM categories WHERE slug = ? ORDER BY deleted_at IS NOT NULL ASC, id ASC LIMIT 1",
);
const insertCategory = db.prepare(
  `INSERT INTO categories (
    remote_id, parent_id, name, slug, description, name_zh, cover_image,
    sort_order, is_active, created_at, updated_at, sync_status,
    local_updated_at, remote_updated_at_snapshot, last_synced_at, deleted_at
  ) VALUES (NULL, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, 'pending_create', ?, NULL, NULL, NULL)`,
);
const updateCategory = db.prepare(
  `UPDATE categories
   SET parent_id = ?, name = ?, slug = ?, name_zh = ?, sort_order = ?, is_active = ?,
       deleted_at = NULL, updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);
const moveChild = db.prepare(
  `UPDATE categories
   SET parent_id = ?, sort_order = ?, updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);

function ensureCategory({ parentId, name, nameZh, slug, sortOrder, isActive }) {
  const row = getBySlug.get(slug);
  if (row) {
    updateCategory.run(parentId, name, slug, nameZh, sortOrder, isActive, ts, ts, row.id);
    return Number(row.id);
  }
  const result = insertCategory.run(
    parentId,
    name,
    slug,
    nameZh,
    sortOrder,
    isActive,
    ts,
    ts,
    ts,
  );
  return Number(result.lastInsertRowid);
}

try {
  db.exec("BEGIN IMMEDIATE");

  const animals = getBySlug.get("animals");
  if (!animals || animals.deleted_at) {
    throw new Error("Animals root category not found.");
  }

  const amphibiansId = ensureCategory({
    parentId: animals.id,
    name: amphibians.name,
    nameZh: amphibians.nameZh,
    slug: amphibians.slug,
    sortOrder: amphibians.sortOrder,
    isActive: amphibians.isActive,
  });

  let moved = 0;
  for (const [index, slug] of amphibians.activeItems.entries()) {
    const child = getBySlug.get(slug);
    if (!child || child.deleted_at) {
      console.warn(`Existing amphibian not found: ${slug}`);
      continue;
    }
    moveChild.run(amphibiansId, index, ts, ts, child.id);
    moved += 1;
  }

  let upserted = 0;
  amphibians.inactiveItems.forEach(([name, nameZh, slug], index) => {
    ensureCategory({
      parentId: amphibiansId,
      name,
      nameZh,
      slug,
      sortOrder: amphibians.activeItems.length + index,
      isActive: 0,
    });
    upserted += 1;
  });

  db.exec("COMMIT");
  console.log(
    `apply-animals-amphibians-expansion: 完成。moved=${moved}, upsertedInactive=${upserted}`,
  );
} catch (error) {
  db.exec("ROLLBACK");
  console.error(error);
  process.exit(1);
} finally {
  db.close();
}
