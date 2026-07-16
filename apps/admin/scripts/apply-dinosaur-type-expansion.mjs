/**
 * 一次性：给 Dinosaurs / 恐龙 增加 3 个不与现有二级重复的专业恐龙类群。
 *
 * 在 printly-admin 目录执行：
 *   node scripts/apply-dinosaur-type-expansion.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");

const groups = [
  {
    name: "Therizinosaurs",
    nameZh: "镰刀龙类",
    slug: "therizinosaurs",
    sortOrder: 9,
    isActive: 0,
    items: [
      ["Therizinosaurus", "镰刀龙", "therizinosaurus"],
      ["Beipiaosaurus", "北票龙", "beipiaosaurus"],
      ["Nothronychus", "懒爪龙", "nothronychus"],
      ["Erlikosaurus", "二连龙", "erlikosaurus"],
      ["Segnosaurus", "慢龙", "segnosaurus"],
      ["Alxasaurus", "阿拉善龙", "alxasaurus"],
      ["Falcarius", "镰爪龙", "falcarius"],
      ["Jianchangosaurus", "建昌龙", "jianchangosaurus"],
    ],
  },
  {
    name: "Ostrich Dinosaurs",
    nameZh: "似鸟龙类",
    slug: "ornithomimosaurs",
    sortOrder: 10,
    isActive: 0,
    items: [
      ["Gallimimus", "似鸡龙", "gallimimus"],
      ["Ornithomimus", "似鸟龙", "ornithomimus"],
      ["Struthiomimus", "似鸵龙", "struthiomimus"],
      ["Deinocheirus", "恐手龙", "deinocheirus"],
      ["Anserimimus", "似雁龙", "anserimimus"],
      ["Archaeornithomimus", "古似鸟龙", "archaeornithomimus"],
      ["Sinornithomimus", "中国似鸟龙", "sinornithomimus"],
      ["Pelecanimimus", "鹈鹕龙", "pelecanimimus"],
    ],
  },
  {
    name: "Small Plant-Eating Dinosaurs",
    nameZh: "小型植食恐龙",
    slug: "small-ornithopods",
    sortOrder: 15,
    isActive: 0,
    items: [
      ["Hypsilophodon", "棱齿龙", "hypsilophodon"],
      ["Dryosaurus", "橡树龙", "dryosaurus"],
      ["Leaellynasaura", "莱利龙", "leaellynasaura"],
      ["Othnielia", "奥斯尼尔龙", "othnielia"],
      ["Parksosaurus", "帕克氏龙", "parksosaurus"],
      ["Thescelosaurus", "奇异龙", "thescelosaurus"],
      ["Orodromeus", "山奔龙", "orodromeus"],
      ["Zephyrosaurus", "西风龙", "zephyrosaurus"],
    ],
  },
];

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

const touchCategory = db.prepare(
  `UPDATE categories
   SET updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);

function ensureCategory({ parentId, name, nameZh, slug, sortOrder, isActive = 0 }) {
  const row = getBySlug.get(slug);
  if (row) {
    updateCategory.run(parentId, name, slug, nameZh, sortOrder, isActive, ts, ts, row.id);
    return Number(row.id);
  }

  const result = insertCategory.run(parentId, name, slug, nameZh, sortOrder, isActive, ts, ts, ts);
  return Number(result.lastInsertRowid);
}

try {
  db.exec("BEGIN IMMEDIATE");

  const dinosaurs = getBySlug.get("dinosaurs");
  if (!dinosaurs || dinosaurs.deleted_at) {
    throw new Error("Dinosaurs root category not found.");
  }

  for (const group of groups) {
    const groupId = ensureCategory({
      parentId: dinosaurs.id,
      name: group.name,
      nameZh: group.nameZh,
      slug: group.slug,
      sortOrder: group.sortOrder,
      isActive: group.isActive,
    });

    group.items.forEach(([name, nameZh, slug], index) => {
      ensureCategory({
        parentId: groupId,
        name,
        nameZh,
        slug,
        sortOrder: index,
      });
    });

    touchCategory.run(ts, ts, groupId);
  }

  touchCategory.run(ts, ts, dinosaurs.id);

  db.exec("COMMIT");
  console.log("apply-dinosaur-type-expansion: 完成。新增/更新 3 个二级分类、24 个三级恐龙。");
} catch (error) {
  db.exec("ROLLBACK");
  console.error(error);
  process.exit(1);
} finally {
  db.close();
}
