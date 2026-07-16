/**
 * 一次性：Plants(449) 清理 + 扩充。
 * A) 去重：软删除跨桶重复的 Lotus Flower(3165)、Hydrangea Shrub(2089)、Lavender Herb(3176)
 *    （分别保留 Aquatic 的 Lotus、Flowers 的 Hydrangea、Flowers 的 Lavender）
 * B) 去后缀：Shrubs 里冗余 "Shrub" 后缀的项改成裸名（名+slug）
 * C) 填充空的 Grasses（含 Bamboo）—— 非活跃
 * D) 新增二级 Carnivorous Plants / 食虫植物 —— 非活跃
 * E) 新增二级 Houseplants / 室内植物 —— 非活跃
 * 幂等：已存在 slug 跳过。
 *
 * 在 printly-admin 目录执行：node scripts/cleanup-plants-taxonomy.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");

const PLANTS = 449;

function nowIso() {
  return new Date().toISOString();
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
const ts = nowIso();

// A) 去重删除
const DEDUP_DELETE = [3165, 2089, 3176];

// B) Shrubs 去后缀 [id, newName, newSlug]
const RENAMES = [
  [2055, "Rhododendron", "rhododendron"],
  [2056, "Boxwood", "boxwood"],
  [2058, "Forsythia", "forsythia"],
  [3168, "Azalea", "azalea"],
  [2077, "Camellia", "camellia"],
  [2078, "Gardenia", "gardenia"],
  [2088, "Viburnum", "viburnum"],
];

// C) Grasses 现有空桶 slug=grasses
const GRASSES = [
  ["Bamboo", "bamboo", "竹子"],
  ["Pampas Grass", "pampas-grass", "蒲苇"],
  ["Fountain Grass", "fountain-grass", "喷泉草"],
  ["Lemongrass", "lemongrass", "柠檬草"],
  ["Sugarcane", "sugarcane", "甘蔗"],
  ["Reed", "reed", "芦苇"],
  ["Ryegrass", "ryegrass", "黑麦草"],
  ["Blue Fescue", "blue-fescue", "蓝羊茅"],
];

// D/E 新二级 + 其三级
const NEW_L2 = [
  {
    l2: ["Carnivorous Plants", "carnivorous-plants", "食虫植物"],
    l3: [
      ["Venus Flytrap", "venus-flytrap", "捕蝇草"],
      ["Pitcher Plant", "pitcher-plant", "猪笼草"],
      ["Sundew", "sundew", "茅膏菜"],
      ["Cobra Lily", "cobra-lily", "眼镜蛇瓶子草"],
      ["Butterwort", "butterwort", "捕虫堇"],
      ["Bladderwort", "bladderwort", "狸藻"],
    ],
  },
  {
    l2: ["Houseplants", "houseplants", "室内植物"],
    l3: [
      ["Monstera", "monstera", "龟背竹"],
      ["Pothos", "pothos", "绿萝"],
      ["Peace Lily", "peace-lily", "白掌"],
      ["Fiddle Leaf Fig", "fiddle-leaf-fig", "琴叶榕"],
      ["Philodendron", "philodendron", "蔓绿绒"],
      ["Bird of Paradise", "bird-of-paradise", "天堂鸟"],
      ["Spider Plant", "spider-plant", "吊兰"],
      ["Rubber Plant", "rubber-plant", "橡皮树"],
    ],
  },
];

const insert = db.prepare(
  `INSERT INTO categories (
    remote_id, parent_id, name, slug, description, name_zh, cover_image,
    sort_order, is_active, created_at, updated_at, sync_status,
    local_updated_at, remote_updated_at_snapshot, last_synced_at, deleted_at
  ) VALUES (NULL, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, 'pending_create', ?, NULL, NULL, NULL)`,
);

const softDelete = db.prepare(
  `UPDATE categories SET deleted_at = ?, updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN remote_id IS NULL THEN sync_status ELSE 'pending_delete' END
   WHERE id = ?`,
);

const rename = db.prepare(
  `UPDATE categories SET name = ?, slug = ?, updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);

function insertUnder(parentId, name, slug, zh, ord, active) {
  const exists = db
    .prepare("SELECT id FROM categories WHERE parent_id = ? AND slug = ? AND deleted_at IS NULL LIMIT 1")
    .get(parentId, slug);
  if (exists) return false;
  insert.run(parentId, name, slug, zh, ord, active, ts, ts, ts);
  return true;
}

try {
  db.exec("BEGIN IMMEDIATE");

  // A) 去重
  for (const id of DEDUP_DELETE) softDelete.run(ts, ts, ts, id);

  // B) 去后缀
  for (const [id, name, slug] of RENAMES) rename.run(name, slug, ts, ts, id);

  let added = 0;

  // C) Grasses
  const grasses = db
    .prepare("SELECT id FROM categories WHERE parent_id = ? AND slug = 'grasses' AND deleted_at IS NULL")
    .get(PLANTS);
  if (!grasses) throw new Error("未找到 Grasses 二级");
  let gord = 0;
  for (const [n, s, z] of GRASSES) if (insertUnder(grasses.id, n, s, z, gord++, 0)) added++;

  // D/E 新二级（非活跃）+ 三级（非活跃）
  const maxRow = db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories WHERE parent_id = ? AND deleted_at IS NULL")
    .get(PLANTS);
  let l2ord = Number(maxRow.m) + 1;

  for (const bucket of NEW_L2) {
    const [name, slug, zh] = bucket.l2;
    let l2id;
    const found = db
      .prepare("SELECT id FROM categories WHERE parent_id = ? AND slug = ? AND deleted_at IS NULL")
      .get(PLANTS, slug);
    if (found) {
      l2id = found.id;
    } else {
      l2id = Number(insert.run(PLANTS, name, slug, zh, l2ord++, 0, ts, ts, ts).lastInsertRowid);
    }
    let ord = 0;
    for (const [n, s, z] of bucket.l3) if (insertUnder(l2id, n, s, z, ord++, 0)) added++;
  }

  db.exec("COMMIT");
  console.log(`cleanup-plants-taxonomy: 完成。去重删除 ${DEDUP_DELETE.length}，去后缀 ${RENAMES.length}，新增三级/二级共 ${added}（均非活跃）。`);
} catch (e) {
  db.exec("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  db.close();
}
