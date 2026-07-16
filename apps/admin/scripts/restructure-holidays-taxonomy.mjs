/**
 * 一次性：Holidays(3108) 结构化重排（主题式 6 桶）。
 * - 顶层显示名 -> "Holidays & Seasons"（slug holidays 不变）
 * - 桶重命名（仅显示名，slug 不变，免重定向）：
 *     family-holidays -> Family & Celebrations
 *     cultural-holidays -> Popular Holidays
 *     awareness-days -> Fun & Awareness Days
 * - 新建：Holidays Around the World（多元节日，含 Lunar New Year 等，均非活跃 -> 桶停用）
 *         School Days（含活跃 Back to School + Graduation + 新增校园主题 -> 桶启用）
 * - 迁移多元节日到 Around the World；Back to School / Graduation 到 School Days
 * - Seasons 只保留春夏秋冬
 * - 重排 6 个二级 sort_order
 *
 * 在 printly-admin 目录执行：node scripts/restructure-holidays-taxonomy.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");

const HOLIDAYS = 3108;
const B_FAMILY = 3109;
const B_CULTURAL = 3110;
const B_AWARENESS = 3111;
const B_SEASONS = 3610;

function nowIso() {
  return new Date().toISOString();
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
const ts = nowIso();

const insert = db.prepare(
  `INSERT INTO categories (
    remote_id, parent_id, name, slug, description, name_zh, cover_image,
    sort_order, is_active, created_at, updated_at, sync_status,
    local_updated_at, remote_updated_at_snapshot, last_synced_at, deleted_at
  ) VALUES (NULL, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, 'pending_create', ?, NULL, NULL, NULL)`,
);
const renameName = db.prepare(
  `UPDATE categories SET name = ?, name_zh = ?, updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);
const reparent = db.prepare(
  `UPDATE categories SET parent_id = ?, sort_order = ?, updated_at = ?, local_updated_at = ?,
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

  // 顶层显示名
  renameName.run("Holidays & Seasons", "节日与季节", ts, ts, HOLIDAYS);

  // 桶显示名（slug 不变）
  renameName.run("Family & Celebrations", "家庭与庆祝", ts, ts, B_FAMILY);
  renameName.run("Popular Holidays", "热门节日", ts, ts, B_CULTURAL);
  renameName.run("Fun & Awareness Days", "趣味与主题日", ts, ts, B_AWARENESS);

  // 新建两个二级
  const aroundId = Number(
    insert.run(HOLIDAYS, "Holidays Around the World", "holidays-around-the-world", "世界各地节日", 1, 0, ts, ts, ts).lastInsertRowid,
  );
  const schoolId = Number(
    insert.run(HOLIDAYS, "School Days", "school-days", "校园", 3, 1, ts, ts, ts).lastInsertRowid,
  );

  // 迁移多元节日 -> Holidays Around the World（保持各自 is_active 不变）
  const around = [3122, 4322, 4323, 4324, 4325, 4326, 4327, 4328];
  around.forEach((id, i) => reparent.run(aroundId, i, ts, ts, id));

  // 迁移 Back to School(3611,活跃) + Graduation(4330) -> School Days
  reparent.run(schoolId, 0, ts, ts, 3611);
  reparent.run(schoolId, 1, ts, ts, 4330);

  // School Days 新增（非活跃）
  const schoolAdds = [
    ["First Day of School", "first-day-of-school", "开学第一天"],
    ["Last Day of School", "last-day-of-school", "学期最后一天"],
    ["100th Day of School", "100th-day-of-school", "开学100天"],
    ["Teacher Appreciation Day", "teacher-appreciation-day", "教师感恩日"],
  ];
  let ord = 2;
  for (const [n, s, z] of schoolAdds) insert.run(schoolId, n, s, z, ord++, 0, ts, ts, ts);

  // 6 个二级排序
  setSort.run(0, ts, ts, B_CULTURAL);   // Popular Holidays
  setSort.run(1, ts, ts, aroundId);      // Holidays Around the World
  setSort.run(2, ts, ts, B_FAMILY);      // Family & Celebrations
  setSort.run(3, ts, ts, schoolId);      // School Days
  setSort.run(4, ts, ts, B_SEASONS);     // Seasons
  setSort.run(5, ts, ts, B_AWARENESS);   // Fun & Awareness Days

  db.exec("COMMIT");
  console.log("restructure-holidays-taxonomy: 完成。");
} catch (e) {
  db.exec("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  db.close();
}
