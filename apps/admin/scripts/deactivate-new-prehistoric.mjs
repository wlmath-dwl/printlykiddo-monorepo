/**
 * 一次性：把本次新加的史前数据置为非活跃（待出图后再启用）。
 * - 174 个新增三级物种 -> is_active = 0（保留 6 个老物种：119/120/3104-3107 活跃）
 * - 只含新物种的 8 个二级桶 -> is_active = 0
 *   （Ice Age Mammals / Marine Reptiles 保持活跃，内含老物种）
 *
 * 在 printly-admin 目录执行：node scripts/deactivate-new-prehistoric.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");

const PRE = 3103;
const KEEP_ACTIVE_L2 = ["ice-age-mammals", "marine-reptiles"];
const KEEP_ACTIVE_L3 = [119, 120, 3104, 3105, 3106, 3107]; // 6 个原有物种

function nowIso() {
  return new Date().toISOString();
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
const ts = nowIso();

const deactivate = db.prepare(
  `UPDATE categories SET is_active = 0, updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);

try {
  db.exec("BEGIN IMMEDIATE");

  const l2Rows = db
    .prepare("SELECT id, slug FROM categories WHERE parent_id = ? AND deleted_at IS NULL")
    .all(PRE);

  let l2Off = 0;
  let l3Off = 0;

  for (const l2 of l2Rows) {
    // 二级：保留 ice-age / marine 活跃，其余停用
    if (!KEEP_ACTIVE_L2.includes(l2.slug)) {
      deactivate.run(ts, ts, l2.id);
      l2Off += 1;
    }

    // 三级：除 6 个老物种外全部停用
    const children = db
      .prepare("SELECT id FROM categories WHERE parent_id = ? AND deleted_at IS NULL")
      .all(l2.id);
    for (const c of children) {
      if (KEEP_ACTIVE_L3.includes(c.id)) continue;
      deactivate.run(ts, ts, c.id);
      l3Off += 1;
    }
  }

  db.exec("COMMIT");
  console.log(`deactivate-new-prehistoric: 完成。停用二级 ${l2Off}，停用三级 ${l3Off}。`);
} catch (e) {
  db.exec("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  db.close();
}
