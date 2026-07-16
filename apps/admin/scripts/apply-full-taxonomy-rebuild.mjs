/**
 * 全量重构五个一级分类：Animals / Machines / Dinosaurs / Plants / Food
 * 仅写入本地 data/local-admin.sqlite。
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { animalsTaxonomy } from "./taxonomy-data/animals.mjs";
import { machinesTaxonomy } from "./taxonomy-data/machines.mjs";
import { dinosaursTaxonomy } from "./taxonomy-data/dinosaurs.mjs";
import { plantsTaxonomy, foodTaxonomy } from "./taxonomy-data/plants-food.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const taxonomies = [
  animalsTaxonomy,
  machinesTaxonomy,
  dinosaursTaxonomy,
  plantsTaxonomy,
  foodTaxonomy,
];

function nowIso() {
  return new Date().toISOString();
}

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['".,()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

const ts = nowIso();

const getBySlug = db.prepare(
  "SELECT * FROM categories WHERE slug = ? ORDER BY deleted_at IS NOT NULL ASC, id ASC LIMIT 1",
);
const getByNameAndParent = db.prepare(
  "SELECT * FROM categories WHERE parent_id IS ? AND lower(name) = lower(?) ORDER BY deleted_at IS NOT NULL ASC, id ASC LIMIT 1",
);
const getByNameUnderRoot = db.prepare(
  `SELECT c.*
   FROM categories c
   INNER JOIN categories p ON p.id = c.parent_id
   WHERE p.parent_id = ?
     AND lower(c.name) = lower(?)
   ORDER BY c.deleted_at IS NOT NULL ASC, c.id ASC
   LIMIT 1`,
);
const insertStmt = db.prepare(
  `INSERT INTO categories (
    remote_id, parent_id, name, slug, description, name_zh, cover_image,
    sort_order, is_active, created_at, updated_at, sync_status,
    local_updated_at, remote_updated_at_snapshot, last_synced_at, deleted_at
  ) VALUES (NULL, ?, ?, ?, NULL, ?, NULL, ?, 1, ?, ?, 'pending_create', ?, NULL, NULL, NULL)`,
);
const updateStmt = db.prepare(
  `UPDATE categories
   SET parent_id = ?, name = ?, slug = ?, name_zh = COALESCE(?, name_zh), sort_order = ?, deleted_at = NULL,
       updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);
const touchStmt = db.prepare(
  `UPDATE categories
   SET updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);

function ensureCategory({ parentId, rootId, name, slug, nameZh, sortOrder }) {
  let row = getBySlug.get(slug);
  if (!row && rootId && parentId !== null) {
    row = getByNameUnderRoot.get(rootId, name);
  }
  if (!row) {
    row = getByNameAndParent.get(parentId, name);
  }

  if (row) {
    updateStmt.run(parentId, name, slug, nameZh ?? null, sortOrder, ts, ts, row.id);
    return row.id;
  }

  const result = insertStmt.run(parentId, name, slug, nameZh ?? null, sortOrder, ts, ts, ts);
  return Number(result.lastInsertRowid);
}

function ensureRoot(taxonomy) {
  const id = ensureCategory({
    parentId: null,
    rootId: null,
    name: taxonomy.name,
    slug: taxonomy.slug,
    nameZh: taxonomy.nameZh,
    sortOrder: taxonomy.sortOrder,
  });
  return id;
}

function countL3(rootId) {
  const row = db
    .prepare(
      `SELECT COUNT(c3.id) AS count
       FROM categories c2
       LEFT JOIN categories c3 ON c3.parent_id = c2.id AND c3.deleted_at IS NULL
       WHERE c2.parent_id = ? AND c2.deleted_at IS NULL`,
    )
    .get(rootId);
  return Number(row?.count ?? 0);
}

function applyTaxonomy(taxonomy) {
  const rootId = ensureRoot(taxonomy);

  taxonomy.children.forEach((child, childIndex) => {
    const childId = ensureCategory({
      parentId: rootId,
      rootId,
      name: child.name,
      slug: child.slug,
      nameZh: child.nameZh,
      sortOrder: child.sortOrder ?? childIndex,
    });

    child.items.forEach((item, itemIndex) => {
      ensureCategory({
        parentId: childId,
        rootId,
        name: item,
        slug: slugify(item),
        nameZh: null,
        sortOrder: itemIndex,
      });
    });

    touchStmt.run(ts, ts, childId);
  });

  touchStmt.run(ts, ts, rootId);
  return rootId;
}

try {
  db.exec("BEGIN IMMEDIATE");

  const rootIds = taxonomies.map((taxonomy) => ({
    slug: taxonomy.slug,
    id: applyTaxonomy(taxonomy),
  }));

  const summary = rootIds.map(({ slug, id }) => `${slug}:${countL3(id)}`).join(", ");

  db.exec("COMMIT");
  console.log(`apply-full-taxonomy-rebuild: 完成。${summary}`);
} catch (error) {
  db.exec("ROLLBACK");
  console.error(error);
  process.exit(1);
} finally {
  db.close();
}
