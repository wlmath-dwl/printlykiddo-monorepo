/**
 * 一次性：在一级 "Prehistoric Animals"(3103) 下建立按"生物大类"划分的二级分类，
 * 并把现有 6 个物种从二级降为三级，挂到对应大类下。
 *
 *   Prehistoric Animals(3103)
 *     ├─ Ice Age Mammals        <- Mammoth / Saber-toothed Tiger / Woolly Rhinoceros / Dire Wolf
 *     ├─ Marine Reptiles        <- Mosasaurus / Plesiosaur
 *     ├─ Pterosaurs             (空，停用)
 *     ├─ Prehistoric Fish       (空，停用)
 *     ├─ Prehistoric Invertebrates (空，停用)
 *     ├─ Prehistoric Reptiles   (空，停用)
 *     ├─ Early Amphibians       (空，停用)
 *     ├─ Prehistoric Birds      (空，停用)
 *     └─ Early Mammals          (空，停用)
 *
 * 在 printly-admin 目录执行：node scripts/restructure-prehistoric-l2.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");

const PREHISTORIC_ID = 3103;

function nowIso() {
  return new Date().toISOString();
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

// 幂等：已建过 marine-reptiles 二级则跳过
const already = db
  .prepare(
    "SELECT id FROM categories WHERE parent_id = ? AND slug = 'marine-reptiles' AND deleted_at IS NULL LIMIT 1",
  )
  .get(PREHISTORIC_ID);
if (already) {
  console.log("restructure-prehistoric-l2: 已应用过，跳过。");
  db.close();
  process.exit(0);
}

const ts = nowIso();

function insertCategory({ name, slug, nameZh, sortOrder, isActive }) {
  const r = db
    .prepare(
      `INSERT INTO categories (
        remote_id, parent_id, name, slug, description, name_zh, cover_image,
        sort_order, is_active, created_at, updated_at, sync_status,
        local_updated_at, remote_updated_at_snapshot, last_synced_at, deleted_at
      ) VALUES (NULL, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, 'pending_create', ?, NULL, NULL, NULL)`,
    )
    .run(PREHISTORIC_ID, name, slug, nameZh, sortOrder, isActive, ts, ts, ts);
  return Number(r.lastInsertRowid);
}

const reparent = db.prepare(
  `UPDATE categories SET parent_id = ?, sort_order = ?, updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);

// [name, slug, nameZh, sortOrder, isActive]
const L2 = [
  ["Ice Age Mammals", "ice-age-mammals", "冰河期哺乳动物", 0, 1],
  ["Marine Reptiles", "marine-reptiles", "史前海生爬行动物", 1, 1],
  ["Pterosaurs", "pterosaurs", "翼龙类", 2, 0],
  ["Prehistoric Fish", "prehistoric-fish", "史前鱼类", 3, 0],
  ["Prehistoric Invertebrates", "prehistoric-invertebrates", "史前无脊椎动物", 4, 0],
  ["Prehistoric Reptiles", "prehistoric-reptiles", "史前爬行动物", 5, 0],
  ["Early Amphibians", "early-amphibians", "早期两栖动物", 6, 0],
  ["Prehistoric Birds", "prehistoric-birds", "史前鸟类", 7, 0],
  ["Early Mammals", "early-mammals", "早期哺乳动物", 8, 0],
];

try {
  db.exec("BEGIN IMMEDIATE");

  const idBySlug = {};
  for (const [name, slug, zh, ord, active] of L2) {
    idBySlug[slug] = insertCategory({
      name,
      slug,
      nameZh: zh,
      sortOrder: ord,
      isActive: active,
    });
  }

  // 现有物种降级：二级 -> 三级，挂到对应大类
  const iceAge = idBySlug["ice-age-mammals"];
  const marine = idBySlug["marine-reptiles"];

  // Ice Age Mammals: Mammoth(3104), Saber-toothed Tiger(3105), Woolly Rhinoceros(3106), Dire Wolf(3107)
  reparent.run(iceAge, 0, ts, ts, 3104);
  reparent.run(iceAge, 1, ts, ts, 3105);
  reparent.run(iceAge, 2, ts, ts, 3106);
  reparent.run(iceAge, 3, ts, ts, 3107);

  // Marine Reptiles: Mosasaurus(119), Plesiosaur(120)
  reparent.run(marine, 0, ts, ts, 119);
  reparent.run(marine, 1, ts, ts, 120);

  db.exec("COMMIT");
  console.log("restructure-prehistoric-l2: 完成。");
} catch (e) {
  db.exec("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  db.close();
}
