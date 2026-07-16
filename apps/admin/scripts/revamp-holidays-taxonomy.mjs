/**
 * 一次性：Holidays(3108) 改造。
 * A) "Seasonal Activities"(3610) 改名为 "Seasons"，slug seasonal-activities -> seasons
 *    （Back to School 保留在其下）；新增 Spring/Summer/Fall/Winter（非活跃）
 * B) Cultural Holidays 补多元节日（非活跃）
 * C) Family Holidays 补 Graduation 等（非活跃）
 * 幂等：已存在 slug 跳过。
 *
 * 在 printly-admin 目录执行：node scripts/revamp-holidays-taxonomy.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");

const HOLIDAYS = 3108;
const SEASONAL_ID = 3610;

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
  ) VALUES (NULL, ?, ?, ?, NULL, ?, NULL, ?, 0, ?, ?, 'pending_create', ?, NULL, NULL, NULL)`,
);

function addTo(parentId, list) {
  const maxRow = db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories WHERE parent_id = ? AND deleted_at IS NULL")
    .get(parentId);
  let ord = Number(maxRow.m) + 1;
  let n = 0;
  for (const [name, slug, zh] of list) {
    const exists = db
      .prepare("SELECT id FROM categories WHERE parent_id = ? AND slug = ? AND deleted_at IS NULL LIMIT 1")
      .get(parentId, slug);
    if (exists) continue;
    insert.run(parentId, name, slug, zh, ord++, ts, ts, ts);
    n++;
  }
  return n;
}

function l2IdBySlug(slug) {
  const r = db
    .prepare("SELECT id FROM categories WHERE parent_id = ? AND slug = ? AND deleted_at IS NULL")
    .get(HOLIDAYS, slug);
  if (!r) throw new Error(`未找到 Holidays 下二级 ${slug}`);
  return r.id;
}

try {
  db.exec("BEGIN IMMEDIATE");

  // A) 改名 Seasonal Activities -> Seasons
  db.prepare(
    `UPDATE categories SET name = 'Seasons', slug = 'seasons', name_zh = '季节',
       updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
     WHERE id = ? AND slug = 'seasonal-activities'`,
  ).run(ts, ts, SEASONAL_ID);

  let added = 0;

  // A) Seasons 四季
  added += addTo(SEASONAL_ID, [
    ["Spring", "spring", "春天"],
    ["Summer", "summer", "夏天"],
    ["Fall", "fall", "秋天"],
    ["Winter", "winter", "冬天"],
  ]);

  // B) Cultural Holidays 多元节日
  added += addTo(l2IdBySlug("cultural-holidays"), [
    ["Day of the Dead", "day-of-the-dead", "亡灵节"],
    ["Hanukkah", "hanukkah", "光明节"],
    ["Diwali", "diwali", "排灯节"],
    ["Cinco de Mayo", "cinco-de-mayo", "五月五日节"],
    ["Mardi Gras", "mardi-gras", "狂欢节"],
    ["Kwanzaa", "kwanzaa", "宽扎节"],
    ["Eid", "eid", "开斋节"],
    ["New Year's Eve", "new-years-eve", "跨年夜"],
  ]);

  // C) Family Holidays 补充
  added += addTo(l2IdBySlug("family-holidays"), [
    ["Graduation", "graduation", "毕业"],
    ["Wedding", "wedding", "婚礼"],
    ["Baby Shower", "baby-shower", "迎婴派对"],
    ["Anniversary", "anniversary", "周年纪念"],
  ]);

  db.exec("COMMIT");
  console.log(`revamp-holidays-taxonomy: 完成。Seasonal Activities -> Seasons；新增三级 ${added}（非活跃）。`);
} catch (e) {
  db.exec("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  db.close();
}
