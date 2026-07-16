/**
 * 一次性：整理 Machines(5) 分类。
 * 1) Excavators(751) 改名为 Construction Vehicles / 工程车，slug excavators -> construction-vehicles
 * 2) 删除 Trucks 下的 Crane Truck(723)（与 Cranes 下 Truck Crane 重复，保留后者）
 * 3) Machines 下所有三级名统一为 Title Case（仅名称，不动 slug）
 *
 * 在 printly-admin 目录执行：node scripts/cleanup-machines-taxonomy.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");

const MACHINES = 5;
const EXCAVATORS_ID = 751;
const CRANE_TRUCK_ID = 723;

function nowIso() {
  return new Date().toISOString();
}

// 仅把"全小写"的单词/连字符段首字母大写，保留 SUV、Mars 等已含大写的词
function titleCase(name) {
  return name
    .split(" ")
    .map((word) =>
      word
        .split("-")
        .map((part) =>
          /[a-z]/.test(part) && part === part.toLowerCase()
            ? part.charAt(0).toUpperCase() + part.slice(1)
            : part,
        )
        .join("-"),
    )
    .join(" ");
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
const ts = nowIso();

try {
  db.exec("BEGIN IMMEDIATE");

  // 1) 重命名 Excavators -> Construction Vehicles
  db.prepare(
    `UPDATE categories SET name = 'Construction Vehicles', name_zh = '工程车', slug = 'construction-vehicles',
       updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
     WHERE id = ? AND slug = 'excavators'`,
  ).run(ts, ts, EXCAVATORS_ID);

  // 2) 软删除重复的 Crane Truck
  db.prepare(
    `UPDATE categories SET deleted_at = ?, updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN remote_id IS NULL THEN sync_status ELSE 'pending_delete' END
     WHERE id = ?`,
  ).run(ts, ts, ts, CRANE_TRUCK_ID);

  // 3) Machines 下所有三级名 Title Case
  const l2Ids = db
    .prepare("SELECT id FROM categories WHERE parent_id = ? AND deleted_at IS NULL")
    .all(MACHINES)
    .map((r) => r.id);

  const upName = db.prepare(
    `UPDATE categories SET name = ?, updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
     WHERE id = ?`,
  );

  let renamed = 0;
  const samples = [];
  for (const l2 of l2Ids) {
    const l3 = db
      .prepare("SELECT id, name FROM categories WHERE parent_id = ? AND deleted_at IS NULL")
      .all(l2);
    for (const c of l3) {
      const next = titleCase(c.name);
      if (next !== c.name) {
        upName.run(next, ts, ts, c.id);
        renamed += 1;
        if (samples.length < 12) samples.push(`${c.name} -> ${next}`);
      }
    }
  }

  db.exec("COMMIT");
  console.log(`cleanup-machines-taxonomy: 完成。`);
  console.log(`  Excavators -> Construction Vehicles (slug construction-vehicles)`);
  console.log(`  软删除 Crane Truck(#${CRANE_TRUCK_ID})`);
  console.log(`  Title Case 改名三级 ${renamed} 条，示例：`);
  for (const s of samples) console.log(`    ${s}`);
} catch (e) {
  db.exec("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  db.close();
}
