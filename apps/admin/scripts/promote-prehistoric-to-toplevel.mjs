/**
 * 一次性：把 "Prehistoric Animals"(id 3103) 从 Animals(4) 下迁出，提升为一级分类。
 * - parent_id = NULL，排在 Dinosaurs 之后(sort_order = 3)，其余一级顺延 +1
 * - 现有 6 个三级(Mosasaurus / Plesiosaur / Mammoth / Saber-toothed Tiger /
 *   Woolly Rhinoceros / Dire Wolf) 继续挂在 3103 下，自动变成二级
 * - slug 保持 prehistoric-animals（URL 由 /animals/prehistoric-animals 变为 /prehistoric-animals）
 *
 * 在 printly-admin 目录执行：node scripts/promote-prehistoric-to-toplevel.mjs
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

// 幂等：已经是一级则跳过
const current = db
  .prepare("SELECT parent_id FROM categories WHERE id = ? AND deleted_at IS NULL")
  .get(PREHISTORIC_ID);

if (!current) {
  console.error(`未找到 id=${PREHISTORIC_ID} 的分类，终止。`);
  db.close();
  process.exit(1);
}
if (current.parent_id === null) {
  console.log("promote-prehistoric-to-toplevel: 已是一级分类，跳过。");
  db.close();
  process.exit(0);
}

const ts = nowIso();

/** 标记为待同步（新建保持 pending_create，其余置 pending_update） */
const touch = db.prepare(
  `UPDATE categories SET updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);

const setSort = db.prepare(
  `UPDATE categories SET sort_order = ?, updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);

try {
  db.exec("BEGIN IMMEDIATE");

  // 现有一级(除 Animals)整体后移一位，给 Prehistoric 腾出 Dinosaurs 之后的位置
  // 目标顺序：Animals(0) Machines(1) Dinosaurs(2) Prehistoric(3) Plants(4)
  //           Holidays(5) Food(6) Buildings(7) Puzzles(8)
  const topLevelOrder = [
    [4, 0], // Animals
    [5, 1], // Machines
    [6, 2], // Dinosaurs
    [PREHISTORIC_ID, 3], // Prehistoric Animals
    [449, 4], // Plants
    [3108, 5], // Holidays
    [2380, 6], // Food
    [3289, 7], // Buildings
    [3578, 8], // Puzzles
  ];
  for (const [id, ord] of topLevelOrder) {
    setSort.run(ord, ts, ts, id);
  }

  // 迁出：parent_id 置空，成为一级
  db.prepare(
    `UPDATE categories SET parent_id = NULL, updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
     WHERE id = ?`,
  ).run(ts, ts, PREHISTORIC_ID);

  db.exec("COMMIT");
  console.log("promote-prehistoric-to-toplevel: 完成。");
} catch (e) {
  db.exec("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  db.close();
}
