/**
 * 一次性：在 Machines(5) 下新增 3 个二级并填充三级。
 * 新二级与其三级一律 is_active = 0（非活跃，待出图后再启用）。
 * 幂等：已存在的 slug 跳过。
 *
 * 在 printly-admin 目录执行：node scripts/add-machines-new-l2.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");

const MACHINES = 5;

function nowIso() {
  return new Date().toISOString();
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
const ts = nowIso();

// 二级：[name, slug, nameZh]，以及其三级 [name, slug, nameZh][]
const NEW = [
  {
    l2: ["Robots", "robots", "机器人"],
    l3: [
      ["Robot", "robot", "机器人"],
      ["Robot Dog", "robot-dog", "机器狗"],
      ["Humanoid Robot", "humanoid-robot", "人形机器人"],
      ["Giant Robot", "giant-robot", "巨型机器人"],
      ["Robot Vacuum", "robot-vacuum", "扫地机器人"],
      ["Robot Arm", "robot-arm", "机械臂"],
      ["Toy Robot", "toy-robot", "玩具机器人"],
      ["Drone", "drone", "无人机"],
      ["Transforming Robot", "transforming-robot", "变形机器人"],
      ["Spider Robot", "spider-robot", "机器蜘蛛"],
    ],
  },
  {
    l2: ["Hot Air Balloons", "hot-air-balloons", "热气球"],
    l3: [
      ["Hot Air Balloon", "hot-air-balloon", "热气球"],
      ["Airship", "airship", "飞艇"],
      ["Blimp", "blimp", "软式飞艇"],
      ["Zeppelin", "zeppelin", "齐柏林飞艇"],
      ["Weather Balloon", "weather-balloon", "气象气球"],
    ],
  },
  {
    l2: ["Amusement Rides", "amusement-rides", "游乐设施"],
    l3: [
      ["Ferris Wheel", "ferris-wheel", "摩天轮"],
      ["Roller Coaster", "roller-coaster", "过山车"],
      ["Carousel", "carousel", "旋转木马"],
      ["Bumper Car", "bumper-car", "碰碰车"],
      ["Swing Ride", "swing-ride", "旋转秋千"],
      ["Teacup Ride", "teacup-ride", "旋转茶杯"],
      ["Drop Tower", "drop-tower", "跳楼机"],
      ["Pirate Ship Ride", "pirate-ship-ride", "海盗船"],
    ],
  },
];

const insert = db.prepare(
  `INSERT INTO categories (
    remote_id, parent_id, name, slug, description, name_zh, cover_image,
    sort_order, is_active, created_at, updated_at, sync_status,
    local_updated_at, remote_updated_at_snapshot, last_synced_at, deleted_at
  ) VALUES (NULL, ?, ?, ?, NULL, ?, NULL, ?, 0, ?, ?, 'pending_create', ?, NULL, NULL, NULL)`,
);

function existsUnder(parentId, slug) {
  return db
    .prepare("SELECT id FROM categories WHERE parent_id = ? AND slug = ? AND deleted_at IS NULL LIMIT 1")
    .get(parentId, slug);
}

try {
  db.exec("BEGIN IMMEDIATE");

  const maxRow = db
    .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories WHERE parent_id = ? AND deleted_at IS NULL")
    .get(MACHINES);
  let l2ord = Number(maxRow.m) + 1;

  let l2n = 0;
  let l3n = 0;

  for (const bucket of NEW) {
    const [name, slug, zh] = bucket.l2;
    let l2id;
    const found = existsUnder(MACHINES, slug);
    if (found) {
      l2id = found.id;
    } else {
      l2id = Number(insert.run(MACHINES, name, slug, zh, l2ord, ts, ts, ts).lastInsertRowid);
      l2ord += 1;
      l2n += 1;
    }

    let ord = 0;
    for (const [n, s, z] of bucket.l3) {
      if (existsUnder(l2id, s)) continue;
      insert.run(l2id, n, s, z, ord, ts, ts, ts);
      ord += 1;
      l3n += 1;
    }
  }

  db.exec("COMMIT");
  console.log(`add-machines-new-l2: 完成。新增二级 ${l2n}，新增三级 ${l3n}（均非活跃）。`);
} catch (e) {
  db.exec("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  db.close();
}
