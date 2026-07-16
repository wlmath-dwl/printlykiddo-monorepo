/**
 * 一次性：按讨论结果调整四个一级下的二级分类，并重挂 Machines / Dinosaurs 相关三级。
 * 在 printly-admin 目录执行：node scripts/apply-category-l2-restructure.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");

function nowIso() {
  return new Date().toISOString();
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

// 已跑过则跳过（避免重复插入 Machines 二级）
const already = db
  .prepare("SELECT id FROM categories WHERE parent_id = 5 AND slug = 'buses' AND deleted_at IS NULL LIMIT 1")
  .get();
if (already) {
  console.log("apply-category-l2-restructure: 已应用过，跳过。");
  db.close();
  process.exit(0);
}

const ts = nowIso();

/** 插入新分类（本地新建，待同步） */
function insertCategory({
  parentId,
  name,
  slug,
  nameZh = null,
  description = null,
  sortOrder = 0,
}) {
  const r = db
    .prepare(
      `INSERT INTO categories (
        remote_id, parent_id, name, slug, description, name_zh, cover_image,
        sort_order, is_active, created_at, updated_at, sync_status,
        local_updated_at, remote_updated_at_snapshot, last_synced_at, deleted_at
      ) VALUES (NULL, ?, ?, ?, ?, ?, NULL, ?, 1, ?, ?, 'pending_create', ?, NULL, NULL, NULL)`,
    )
    .run(
      parentId,
      name,
      slug,
      description,
      nameZh,
      sortOrder,
      ts,
      ts,
      ts,
    );
  return Number(r.lastInsertRowid);
}

function touchCategory(id) {
  db.prepare(
    `UPDATE categories SET updated_at = ?, local_updated_at = ?, sync_status =
      CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
     WHERE id = ?`,
  ).run(ts, ts, id);
}

function softDeleteCategory(id) {
  db.prepare(
    `UPDATE categories SET deleted_at = ?, updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN remote_id IS NULL THEN sync_status ELSE 'pending_delete' END
     WHERE id = ?`,
  ).run(ts, ts, ts, id);
}

try {
  db.exec("BEGIN IMMEDIATE");

  // --- Animals：二级改名与排序（不改 L3 父级）---
  const animals = [
    [15, "Pets", "pets", "宠物", 0],
    [10, "Farm Animals", "farm-animals", "农场动物", 1],
    [12, "Safari Animals", "safari-animals", "草原动物", 2],
    [13, "Jungle Animals", "jungle-animals", "丛林动物", 3],
    [16, "Forest Animals", "forest-animals", "森林动物", 4],
    [35, "Arctic Animals", "arctic-animals", "极地动物", 5],
    [11, "Ocean Animals", "ocean-animals", "海洋动物", 6],
    [36, "Birds", "birds", "鸟类", 7],
    [14, "Insects", "insects", "昆虫", 8],
    [37, "Reptiles", "reptiles", "爬行类", 9],
  ];
  const upAnimal = db.prepare(
    `UPDATE categories SET name = ?, slug = ?, name_zh = ?, sort_order = ?,
     deleted_at = NULL, updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
     WHERE id = ?`,
  );
  for (const [id, name, slug, zh, ord] of animals) {
    upAnimal.run(name, slug, zh, ord, ts, ts, id);
  }

  // --- Plants：改名 + 补空二级 ---
  db.prepare(
    `UPDATE categories SET name = 'Succulents', slug = 'succulents', name_zh = '多肉植物',
     sort_order = 4, updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
     WHERE id = 551`,
  ).run(ts, ts);
  db.prepare(
    `UPDATE categories SET name = 'Grains', slug = 'grains', name_zh = '谷物',
     sort_order = 5, updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
     WHERE id = 566`,
  ).run(ts, ts);
  db.prepare(
    `UPDATE categories SET name = 'Aquatic Plants', slug = 'aquatic-plants', name_zh = '水生植物',
     sort_order = 6, updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
     WHERE id = 581`,
  ).run(ts, ts);

  const plantInserts = [
    [7, "Shrubs", "shrubs", "灌木"],
    [8, "Herbs", "herbs", "香草"],
    [9, "Beans", "beans", "豆类"],
    [10, "Ferns", "ferns", "蕨类"],
    [11, "Vines", "vines", "藤本植物"],
    [12, "Mosses", "mosses", "苔藓"],
  ];
  for (const [ord, name, slug, zh] of plantInserts) {
    const exists = db.prepare("SELECT id FROM categories WHERE parent_id = 449 AND slug = ? LIMIT 1").get(slug);
    if (!exists) {
      insertCategory({ parentId: 449, name, slug, nameZh: zh, sortOrder: ord });
    }
  }
  touchCategory(449);

  // --- Machines：L1 id = 5 ---
  const M = 5;

  // 复活并固定 Cars / Trucks / Trains（历史上曾软删）
  db.prepare(
    `UPDATE categories SET name = 'Cars', slug = 'cars', parent_id = ?, sort_order = 0,
     deleted_at = NULL, name_zh = '汽车', updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
     WHERE id = 17`,
  ).run(M, ts, ts);
  db.prepare(
    `UPDATE categories SET name = 'Trucks', slug = 'trucks', parent_id = ?, sort_order = 1,
     deleted_at = NULL, name_zh = '卡车', updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
     WHERE id = 18`,
  ).run(M, ts, ts);
  db.prepare(
    `UPDATE categories SET name = 'Trains', slug = 'trains', parent_id = ?, sort_order = 4,
     deleted_at = NULL, name_zh = '火车', updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
     WHERE id = 20`,
  ).run(M, ts, ts);

  const busesId = insertCategory({ parentId: M, name: "Buses", slug: "buses", nameZh: "巴士", sortOrder: 2 });
  const motoId = insertCategory({ parentId: M, name: "Motorcycles", slug: "motorcycles", nameZh: "摩托车", sortOrder: 3 });
  const planesId = insertCategory({ parentId: M, name: "Airplanes", slug: "airplanes", nameZh: "飞机", sortOrder: 5 });
  const heliId = insertCategory({ parentId: M, name: "Helicopters", slug: "helicopters", nameZh: "直升机", sortOrder: 6 });
  const shipsId = insertCategory({ parentId: M, name: "Ships", slug: "ships", nameZh: "轮船", sortOrder: 7 });
  const subId = insertCategory({ parentId: M, name: "Submarines", slug: "submarines", nameZh: "潜艇", sortOrder: 8 });
  const cranesId = insertCategory({ parentId: M, name: "Cranes", slug: "cranes", nameZh: "起重机", sortOrder: 9 });
  const excavId = insertCategory({ parentId: M, name: "Excavators", slug: "excavators", nameZh: "挖掘机", sortOrder: 10 });

  const reparent = db.prepare("UPDATE categories SET parent_id = ?, updated_at = ?, local_updated_at = ? WHERE id = ?");

  // Road -> Cars / Trucks / Buses / Motorcycles
  const toCars = [663, 666, 668, 669, 670];
  const toTrucks = [664, 665, 671, 672, 673, 674, 675, 676, 683];
  const toBuses = [661, 662];
  const toMoto = [667];
  for (const id of toCars) reparent.run(17, ts, ts, id);
  for (const id of toTrucks) reparent.run(18, ts, ts, id);
  for (const id of toBuses) reparent.run(busesId, ts, ts, id);
  for (const id of toMoto) reparent.run(motoId, ts, ts, id);

  // Rail -> Trains
  for (const id of [677, 678, 679, 680, 681, 682, 734]) {
    reparent.run(20, ts, ts, id);
  }

  // Air -> Airplanes / Helicopters
  const toHeli = [686, 695, 696, 697];
  const toPlane = [685, 687, 688, 689, 690, 691, 692, 693, 694];
  for (const id of toHeli) reparent.run(heliId, ts, ts, id);
  for (const id of toPlane) reparent.run(planesId, ts, ts, id);

  // Water -> Ships / Submarines
  for (const id of [703]) reparent.run(subId, ts, ts, id);
  const toShips = [699, 700, 701, 702, 704, 705, 706, 707, 708, 709, 710, 711, 712];
  for (const id of toShips) reparent.run(shipsId, ts, ts, id);

  // Build -> Excavators / Cranes / Trucks（716 Crane、723 Crane Truck 归 Cranes）
  const toExc = [714, 715, 718, 719, 720, 724, 725];
  const toCran = [716, 723];
  const toTruckBuild = [721, 722];
  for (const id of toExc) reparent.run(excavId, ts, ts, id);
  for (const id of toCran) reparent.run(cranesId, ts, ts, id);
  for (const id of toTruckBuild) reparent.run(18, ts, ts, id);

  // Orbit -> Space（保留 slug orbit 避免外链失效；展示名改为 Space）
  db.prepare(
    `UPDATE categories SET name = 'Space', name_zh = '太空', sort_order = 11, updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
     WHERE id = 735`,
  ).run(ts, ts);

  // Farm -> Tractors
  db.prepare(
    `UPDATE categories SET name = 'Tractors', slug = 'tractors', name_zh = '拖拉机', sort_order = 12, updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
     WHERE id = 736`,
  ).run(ts, ts);

  // 软删旧 Machines 二级（已腾空）
  for (const id of [660, 684, 698, 713, 733]) {
    softDeleteCategory(id);
  }

  [
    17, 18, 20, busesId, motoId, planesId, heliId, shipsId, subId, cranesId, excavId, 735, 736,
  ].forEach(touchCategory);

  // --- Dinosaurs：拆分 Armored；改名；迁出非恐龙 ---
  const D = 6;

  const platedId = insertCategory({
    parentId: D,
    name: "Plated Dinosaurs",
    slug: "plated-dinosaurs",
    nameZh: "剑龙类",
    sortOrder: 3,
  });
  const armoredId = insertCategory({
    parentId: D,
    name: "Armored Dinosaurs",
    slug: "armored-dinos",
    nameZh: "甲龙类",
    sortOrder: 4,
  });
  const domeId = insertCategory({
    parentId: D,
    name: "Dome Head Dinosaurs",
    slug: "dome-head-dinosaurs",
    nameZh: "肿头龙类",
    sortOrder: 5,
  });

  // 445 改为 Horned，只留三角龙
  db.prepare(
    `UPDATE categories SET name = 'Horned Dinosaurs', slug = 'horned-dinosaurs', name_zh = '角龙类', sort_order = 2,
     updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
     WHERE id = 445`,
  ).run(ts, ts);
  reparent.run(platedId, ts, ts, 110);
  reparent.run(armoredId, ts, ts, 111);
  reparent.run(domeId, ts, ts, 114);

  db.prepare(
    `UPDATE categories SET name = 'Carnivorous Dinosaurs', slug = 'carnivorous-dinosaurs', name_zh = '食肉恐龙',
     sort_order = 0, updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
     WHERE id = 101`,
  ).run(ts, ts);
  db.prepare(
    `UPDATE categories SET name = 'Long Neck Dinosaurs', slug = 'long-neck-dinosaurs', name_zh = '长颈恐龙',
     sort_order = 1, updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
     WHERE id = 107`,
  ).run(ts, ts);

  // 飞行爬行类、海生爬行类、冰河期哺乳类：迁到 Animals 对应二级后删除原二级
  reparent.run(36, ts, ts, 116);
  reparent.run(36, ts, ts, 117);
  reparent.run(11, ts, ts, 119);
  reparent.run(11, ts, ts, 120);
  reparent.run(35, ts, ts, 122);
  reparent.run(12, ts, ts, 123);

  touchCategory(108);
  touchCategory(109);
  touchCategory(112);
  touchCategory(446);
  touchCategory(447);
  touchCategory(102);
  touchCategory(103);
  touchCategory(104);
  touchCategory(105);
  touchCategory(106);

  for (const id of [116, 117, 119, 120, 122, 123]) touchCategory(id);
  for (const id of [36, 11, 35, 12]) touchCategory(id);

  softDeleteCategory(115);
  softDeleteCategory(118);
  softDeleteCategory(121);

  for (const id of [101, 107, 445, platedId, armoredId, domeId]) touchCategory(id);

  // 统一 sort_order，避免与历史软删二级同号
  const orderMachines = [
    [17, 0],
    [18, 1],
    [busesId, 2],
    [motoId, 3],
    [20, 4],
    [planesId, 5],
    [heliId, 6],
    [shipsId, 7],
    [subId, 8],
    [cranesId, 9],
    [excavId, 10],
    [735, 11],
    [736, 12],
  ];
  const upSort = db.prepare("UPDATE categories SET sort_order = ? WHERE id = ?");
  for (const [id, ord] of orderMachines) upSort.run(ord, id);

  const orderDino = [
    [101, 0],
    [107, 1],
    [445, 2],
    [platedId, 3],
    [armoredId, 4],
    [domeId, 5],
  ];
  for (const [id, ord] of orderDino) upSort.run(ord, id);

  db.exec("COMMIT");
  console.log("apply-category-l2-restructure: 完成。");
} catch (e) {
  db.exec("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  db.close();
}
