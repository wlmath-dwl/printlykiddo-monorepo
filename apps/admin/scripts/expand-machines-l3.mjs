/**
 * 一次性：Machines(5) 分类清理 + 三级扩充。
 * 清理（均为非活跃，安全）：软删除 Moon Boots(642)、Oxygen Tank(644)（非机械）、
 *   Rover(737)（与 active 的 Mars Rover 重复）。
 * 扩充：给各二级补充合理的三级（全部 is_active = 0，非活跃待出图）。
 * 幂等：已存在的 slug 跳过。
 *
 * 在 printly-admin 目录执行：node scripts/expand-machines-l3.mjs
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

// 按二级 slug 归组的三级新增：[name, slug, nameZh]
const ADD = {
  cars: [
    ["Station Wagon", "station-wagon", "旅行车"],
    ["Roadster", "roadster", "双座跑车"],
    ["Compact Car", "compact-car", "紧凑型车"],
    ["Formula 1 Car", "formula-1-car", "一级方程式赛车"],
  ],
  trucks: [
    ["Ice Cream Truck", "ice-cream-truck", "冰淇淋车"],
    ["Food Truck", "food-truck", "餐车"],
    ["Mail Truck", "mail-truck", "邮政车"],
    ["Concrete Pump Truck", "concrete-pump-truck", "混凝土泵车"],
    ["Refrigerated Truck", "refrigerated-truck", "冷藏车"],
  ],
  "construction-vehicles": [
    ["Scraper", "scraper", "铲运机"],
    ["Compactor", "compactor", "压实机"],
    ["Dragline Excavator", "dragline-excavator", "拉铲挖掘机"],
    ["Tunnel Boring Machine", "tunnel-boring-machine", "隧道掘进机"],
  ],
  orbit: [
    ["Flying Saucer", "flying-saucer", "飞碟"],
    ["Booster Rocket", "booster-rocket", "助推火箭"],
    ["Cargo Spacecraft", "cargo-spacecraft", "货运飞船"],
  ],
  buses: [
    ["Party Bus", "party-bus", "派对巴士"],
  ],
  motorcycles: [
    ["Cafe Racer", "cafe-racer", "咖啡赛车摩托"],
    ["Moped", "moped", "助力车"],
    ["Motorcycle Trike", "motorcycle-trike", "三轮摩托"],
  ],
  trains: [
    ["Funicular", "funicular", "缆索铁路"],
    ["Mine Cart", "mine-cart", "矿车"],
    ["Model Train", "model-train", "模型火车"],
  ],
  airplanes: [
    ["Passenger Plane", "passenger-plane", "客机"],
    ["Jumbo Jet", "jumbo-jet", "大型喷气客机"],
    ["Aerobatic Plane", "aerobatic-plane", "特技飞机"],
    ["Ultralight", "ultralight", "超轻型飞机"],
  ],
  helicopters: [
    ["News Helicopter", "news-helicopter", "新闻直升机"],
    ["Passenger Helicopter", "passenger-helicopter", "客运直升机"],
    ["Twin-Rotor Helicopter", "twin-rotor-helicopter", "双旋翼直升机"],
  ],
  ships: [
    ["Catamaran", "catamaran", "双体船"],
    ["Container Ship", "container-ship", "集装箱船"],
    ["Icebreaker", "icebreaker", "破冰船"],
    ["Gondola", "gondola", "贡多拉"],
    ["Jet Ski", "jet-ski", "水上摩托"],
    ["Houseboat", "houseboat", "船屋"],
  ],
  submarines: [
    ["Yellow Submarine", "yellow-submarine", "黄色潜水艇"],
    ["Diving Bell", "diving-bell", "潜水钟"],
  ],
  cranes: [
    ["Rough Terrain Crane", "rough-terrain-crane", "越野轮胎起重机"],
    ["Railroad Crane", "railroad-crane", "铁路起重机"],
    ["All-Terrain Crane", "all-terrain-crane", "全地面起重机"],
  ],
  tractors: [
    ["Utility Tractor", "utility-tractor", "多用途拖拉机"],
    ["Row Crop Tractor", "row-crop-tractor", "中耕拖拉机"],
    ["Orchard Tractor", "orchard-tractor", "果园拖拉机"],
    ["Compact Tractor", "compact-tractor", "紧凑型拖拉机"],
  ],
  robots: [
    ["Delivery Robot", "delivery-robot", "配送机器人"],
    ["Robot Cat", "robot-cat", "机器猫"],
    ["Space Robot", "space-robot", "太空机器人"],
  ],
  "hot-air-balloons": [
    ["Gas Balloon", "gas-balloon", "气体气球"],
    ["Solar Balloon", "solar-balloon", "太阳能气球"],
  ],
  "amusement-rides": [
    ["Log Flume", "log-flume", "激流勇进"],
    ["Water Slide", "water-slide", "水滑梯"],
    ["Pendulum Ride", "pendulum-ride", "钟摆"],
    ["Bumper Boats", "bumper-boats", "碰碰船"],
    ["Kiddie Train", "kiddie-train", "游乐小火车"],
  ],
};

const insert = db.prepare(
  `INSERT INTO categories (
    remote_id, parent_id, name, slug, description, name_zh, cover_image,
    sort_order, is_active, created_at, updated_at, sync_status,
    local_updated_at, remote_updated_at_snapshot, last_synced_at, deleted_at
  ) VALUES (NULL, ?, ?, ?, NULL, ?, NULL, ?, 0, ?, ?, 'pending_create', ?, NULL, NULL, NULL)`,
);

const softDelete = db.prepare(
  `UPDATE categories SET deleted_at = ?, updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN remote_id IS NULL THEN sync_status ELSE 'pending_delete' END
   WHERE id = ?`,
);

try {
  db.exec("BEGIN IMMEDIATE");

  // 清理
  for (const id of [642, 644, 737]) softDelete.run(ts, ts, ts, id);

  // 二级 slug -> id
  const l2Rows = db
    .prepare("SELECT id, slug FROM categories WHERE parent_id = ? AND deleted_at IS NULL")
    .all(MACHINES);
  const l2IdBySlug = new Map(l2Rows.map((r) => [r.slug, r.id]));

  let inserted = 0;
  let skipped = 0;

  for (const [bucketSlug, list] of Object.entries(ADD)) {
    const parentId = l2IdBySlug.get(bucketSlug);
    if (!parentId) throw new Error(`未找到二级：${bucketSlug}`);

    const maxRow = db
      .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories WHERE parent_id = ? AND deleted_at IS NULL")
      .get(parentId);
    let ord = Number(maxRow.m) + 1;

    for (const [name, slug, zh] of list) {
      const exists = db
        .prepare("SELECT id FROM categories WHERE parent_id = ? AND slug = ? AND deleted_at IS NULL LIMIT 1")
        .get(parentId, slug);
      if (exists) {
        skipped += 1;
        continue;
      }
      insert.run(parentId, name, slug, zh, ord, ts, ts, ts);
      ord += 1;
      inserted += 1;
    }
  }

  db.exec("COMMIT");
  console.log(`expand-machines-l3: 完成。软删除 3，新增三级 ${inserted}（非活跃），跳过 ${skipped}。`);
} catch (e) {
  db.exec("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  db.close();
}
