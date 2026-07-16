/**
 * 一次性：新增 Buildings / 建筑 一级分类及其二级、三级分类。
 * 在 printly-admin 目录执行：node scripts/apply-buildings-taxonomy.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");

const taxonomy = {
  name: "Buildings",
  nameZh: "建筑",
  slug: "buildings",
  sortOrder: 6,
  children: [
    {
      name: "Living Buildings",
      nameZh: "生活建筑",
      slug: "living-buildings",
      items: [
        ["House", "房屋", "house"],
        ["Apartment Building", "公寓楼", "apartment-building"],
        ["Cottage", "小屋", "cottage"],
        ["Cabin", "木屋", "cabin"],
        ["Log Cabin", "原木小屋", "log-cabin"],
        ["Farmhouse", "农舍", "farmhouse"],
        ["Villa", "别墅", "villa"],
        ["Townhouse", "联排房屋", "townhouse"],
        ["Bungalow", "平房", "bungalow"],
        ["Hut", "茅屋", "hut"],
        ["Tree House", "树屋", "tree-house"],
        ["Igloo", "冰屋", "igloo"],
        ["Tent", "帐篷", "tent"],
        ["School", "学校", "school"],
        ["Kindergarten", "幼儿园", "kindergarten"],
        ["University", "大学", "university"],
        ["Schoolhouse", "校舍", "schoolhouse"],
        ["Hospital", "医院", "hospital"],
        ["Clinic", "诊所", "clinic"],
        ["Library", "图书馆", "library"],
        ["Museum", "博物馆", "museum"],
        ["Theater", "剧院", "theater"],
        ["Movie Theater", "电影院", "movie-theater"],
        ["Restaurant", "餐厅", "restaurant"],
        ["Cafe", "咖啡馆", "cafe"],
        ["Bakery", "面包店", "bakery"],
        ["Grocery Store", "杂货店", "grocery-store"],
        ["Supermarket", "超市", "supermarket"],
        ["Toy Store", "玩具店", "toy-store"],
        ["Bookstore", "书店", "bookstore"],
        ["Bank", "银行", "bank"],
        ["Office Building", "办公楼", "office-building"],
        ["Hotel", "酒店", "hotel"],
        ["Fire Station", "消防站", "fire-station"],
        ["Police Station", "警察局", "police-station"],
        ["Post Office", "邮局", "post-office"],
        ["City Hall", "市政厅", "city-hall"],
        ["Courthouse", "法院", "courthouse"],
        ["Community Center", "社区中心", "community-center"],
        ["Gym", "体育馆", "gym"],
        ["Stadium", "体育场", "stadium"],
        ["Swimming Pool", "游泳馆", "swimming-pool"],
        ["Zoo Entrance", "动物园入口", "zoo-entrance"],
        ["Aquarium Building", "水族馆", "aquarium-building"],
      ],
    },
    {
      name: "Transport Buildings",
      nameZh: "交通建筑",
      slug: "transport-buildings",
      items: [
        ["Train Station", "火车站", "train-station"],
        ["Subway Station", "地铁站", "subway-station"],
        ["Bus Station", "公交站", "bus-station"],
        ["Bus Stop", "公交站牌", "bus-stop"],
        ["Bus Stop Shelter", "公交候车亭", "bus-stop-shelter"],
        ["Tram Station", "有轨电车站", "tram-station"],
        ["Airport", "机场", "airport"],
        ["Airport Terminal", "机场航站楼", "airport-terminal"],
        ["Airport Hangar", "飞机库", "airport-hangar"],
        ["Harbor", "港口", "harbor"],
        ["Ferry Terminal", "渡轮码头", "ferry-terminal"],
        ["Train Depot", "火车车库", "train-depot"],
        ["Bus Depot", "公交车库", "bus-depot"],
        ["Parking Garage", "停车楼", "parking-garage"],
        ["Garage", "车库", "garage"],
        ["Gas Station", "加油站", "gas-station"],
        ["Car Wash", "洗车房", "car-wash"],
        ["Toll Booth", "收费站", "toll-booth"],
        ["Control Tower", "控制塔", "control-tower"],
        ["Rest Stop", "休息站", "rest-stop"],
        ["Boat House", "船屋", "boat-house"],
      ],
    },
    {
      name: "Industrial Buildings",
      nameZh: "工业建筑",
      slug: "industrial-buildings",
      items: [
        ["Factory", "工厂", "factory"],
        ["Warehouse", "仓库", "warehouse"],
        ["Workshop", "车间", "workshop"],
        ["Power Plant", "发电厂", "power-plant"],
        ["Solar Power Plant", "太阳能电站", "solar-power-plant"],
        ["Wind Farm", "风电场", "wind-farm"],
        ["Water Treatment Plant", "水处理厂", "water-treatment-plant"],
        ["Recycling Center", "回收中心", "recycling-center"],
        ["Construction Site", "建筑工地", "construction-site"],
        ["Mine", "矿山", "mine"],
        ["Mine Entrance", "矿井入口", "mine-entrance"],
        ["Oil Refinery", "炼油厂", "oil-refinery"],
        ["Steel Mill", "钢铁厂", "steel-mill"],
        ["Lumber Mill", "木材厂", "lumber-mill"],
        ["Sawmill", "锯木厂", "sawmill"],
        ["Barn", "谷仓", "barn"],
        ["Red Barn", "红色谷仓", "red-barn"],
        ["Silo", "粮仓", "silo"],
        ["Greenhouse", "温室", "greenhouse"],
        ["Farm Building", "农场建筑", "farm-building"],
        ["Water Tower", "水塔", "water-tower"],
        ["Windmill", "风车", "windmill"],
        ["Shed", "棚屋", "shed"],
        ["Storage Shed", "储物棚", "storage-shed"],
      ],
    },
    {
      name: "Infrastructure",
      nameZh: "基础设施",
      slug: "infrastructure",
      items: [
        ["Bridge", "桥", "bridge"],
        ["Suspension Bridge", "悬索桥", "suspension-bridge"],
        ["Stone Bridge", "石桥", "stone-bridge"],
        ["Wooden Bridge", "木桥", "wooden-bridge"],
        ["Covered Bridge", "廊桥", "covered-bridge"],
        ["Drawbridge", "吊桥", "drawbridge"],
        ["Arch Bridge", "拱桥", "arch-bridge"],
        ["Rope Bridge", "绳桥", "rope-bridge"],
        ["Tunnel", "隧道", "tunnel"],
        ["Dam", "水坝", "dam"],
        ["Lighthouse", "灯塔", "lighthouse"],
        ["Pier", "码头", "pier"],
        ["Dock", "船坞", "dock"],
        ["Aqueduct", "渡槽", "aqueduct"],
        ["Canal Lock", "运河船闸", "canal-lock"],
        ["Water Well", "水井", "water-well"],
        ["Fountain", "喷泉", "fountain"],
        ["Clock Tower", "钟楼", "clock-tower"],
        ["Bell Tower", "钟塔", "bell-tower"],
        ["Skyscraper", "摩天楼", "skyscraper"],
        ["Tower", "塔楼", "tower"],
        ["Observation Tower", "观景塔", "observation-tower"],
        ["Radio Tower", "无线电塔", "radio-tower"],
        ["City Gate", "城门", "city-gate"],
        ["City Wall", "城墙", "city-wall"],
        ["Boardwalk", "木栈道", "boardwalk"],
        ["Water Park", "水上乐园", "water-park"],
      ],
    },
    {
      name: "Historic Buildings",
      nameZh: "历史建筑",
      slug: "historic-buildings",
      items: [
        ["Castle", "城堡", "castle"],
        ["Medieval Castle", "中世纪城堡", "medieval-castle"],
        ["Palace", "宫殿", "palace"],
        ["Fortress", "堡垒", "fortress"],
        ["Watchtower", "瞭望塔", "watchtower"],
        ["Pyramid", "金字塔", "pyramid"],
        ["Colosseum", "斗兽场", "colosseum"],
        ["Ancient Temple", "古代神庙", "ancient-temple"],
        ["Temple", "寺庙", "temple"],
        ["Church", "教堂", "church"],
        ["Cathedral", "大教堂", "cathedral"],
        ["Mosque", "清真寺", "mosque"],
        ["Pagoda", "宝塔", "pagoda"],
        ["Shrine", "神社", "shrine"],
        ["Chapel", "小教堂", "chapel"],
        ["Monastery", "修道院", "monastery"],
        ["Ruins", "遗迹", "ruins"],
        ["Ancient Ruins", "古代遗迹", "ancient-ruins"],
        ["Stonehenge", "巨石阵", "stonehenge"],
        ["Great Wall", "长城", "great-wall"],
        ["Monument", "纪念碑", "monument"],
        ["Memorial", "纪念馆", "memorial"],
        ["Obelisk", "方尖碑", "obelisk"],
        ["Amphitheater", "圆形剧场", "amphitheater"],
        ["Old City Gate", "古城门", "old-city-gate"],
        ["Ancient Tower", "古塔", "ancient-tower"],
        ["Mausoleum", "陵墓", "mausoleum"],
        ["Historic House", "历史房屋", "historic-house"],
        ["Ancient Palace", "古代宫殿", "ancient-palace"],
        ["Leaning Tower", "斜塔", "leaning-tower"],
        ["Statue", "雕像", "statue"],
        ["Triumphal Arch", "凯旋门", "triumphal-arch"],
        ["Ancient Theater", "古代剧场", "ancient-theater"],
      ],
    },
    {
      name: "Fantasy Buildings",
      nameZh: "奇幻建筑",
      slug: "fantasy-buildings",
      items: [
        ["Haunted House", "鬼屋", "haunted-house"],
        ["Haunted Castle", "鬼城堡", "haunted-castle"],
        ["Mushroom House", "蘑菇屋", "mushroom-house"],
        ["Gingerbread House", "姜饼屋", "gingerbread-house"],
        ["Candy House", "糖果屋", "candy-house"],
        ["Fairy Cottage", "仙子小屋", "fairy-cottage"],
        ["Fairy House", "仙子屋", "fairy-house"],
        ["Fairy Tale Castle", "童话城堡", "fairy-tale-castle"],
        ["Princess Castle", "公主城堡", "princess-castle"],
        ["Wizard Tower", "魔法塔", "wizard-tower"],
        ["Magic School", "魔法学校", "magic-school"],
        ["Dragon Castle", "巨龙城堡", "dragon-castle"],
        ["Ice Castle", "冰雪城堡", "ice-castle"],
        ["Cloud Castle", "云朵城堡", "cloud-castle"],
        ["Elf House", "精灵屋", "elf-house"],
        ["Hobbit House", "霍比特小屋", "hobbit-house"],
        ["Tree Village", "树屋村", "tree-village"],
        ["Underwater Castle", "海底城堡", "underwater-castle"],
        ["Space House", "太空房屋", "space-house"],
        ["Pumpkin House", "南瓜屋", "pumpkin-house"],
        ["Snow Cottage", "雪地小屋", "snow-cottage"],
        ["Magic Library", "魔法图书馆", "magic-library"],
        ["Monster House", "怪物屋", "monster-house"],
      ],
    },
  ],
};

function nowIso() {
  return new Date().toISOString();
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const ts = nowIso();

const getByParentAndSlug = db.prepare(
  "SELECT * FROM categories WHERE parent_id IS ? AND slug = ? ORDER BY deleted_at IS NOT NULL ASC, id ASC LIMIT 1",
);
const getByParentAndName = db.prepare(
  "SELECT * FROM categories WHERE parent_id IS ? AND lower(name) = lower(?) ORDER BY deleted_at IS NOT NULL ASC, id ASC LIMIT 1",
);
const insertStmt = db.prepare(
  `INSERT INTO categories (
    remote_id, parent_id, name, slug, description, name_zh, cover_image,
    sort_order, is_active, created_at, updated_at, sync_status,
    local_updated_at, remote_updated_at_snapshot, last_synced_at, deleted_at
  ) VALUES (NULL, ?, ?, ?, NULL, ?, NULL, ?, 1, ?, ?, 'pending_create', ?, NULL, NULL, NULL)`,
);
const updateStmt = db.prepare(
  `UPDATE categories
   SET parent_id = ?, name = ?, slug = ?, name_zh = ?, sort_order = ?, is_active = 1, deleted_at = NULL,
       updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);
const touchStmt = db.prepare(
  `UPDATE categories
   SET updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);

function ensureCategory({ parentId, name, nameZh, slug, sortOrder }) {
  const existing = getByParentAndSlug.get(parentId, slug) ?? getByParentAndName.get(parentId, name);
  if (existing) {
    updateStmt.run(parentId, name, slug, nameZh, sortOrder, ts, ts, existing.id);
    return { id: Number(existing.id), created: false };
  }

  const result = insertStmt.run(parentId, name, slug, nameZh, sortOrder, ts, ts, ts);
  return { id: Number(result.lastInsertRowid), created: true };
}

function countDescendants(rootId) {
  return db
    .prepare(
      `WITH RECURSIVE tree(id, depth) AS (
        SELECT id, 1 FROM categories WHERE id = ? AND deleted_at IS NULL
        UNION ALL
        SELECT c.id, tree.depth + 1
        FROM categories c
        JOIN tree ON c.parent_id = tree.id
        WHERE c.deleted_at IS NULL
      )
      SELECT
        SUM(depth = 2) AS level2,
        SUM(depth = 3) AS level3,
        COUNT(*) AS total
      FROM tree`,
    )
    .get(rootId);
}

try {
  db.exec("BEGIN IMMEDIATE");

  let created = 0;
  let updated = 0;
  const rootResult = ensureCategory({
    parentId: null,
    name: taxonomy.name,
    nameZh: taxonomy.nameZh,
    slug: taxonomy.slug,
    sortOrder: taxonomy.sortOrder,
  });
  created += rootResult.created ? 1 : 0;
  updated += rootResult.created ? 0 : 1;

  taxonomy.children.forEach((child, childIndex) => {
    const childResult = ensureCategory({
      parentId: rootResult.id,
      name: child.name,
      nameZh: child.nameZh,
      slug: child.slug,
      sortOrder: childIndex,
    });
    created += childResult.created ? 1 : 0;
    updated += childResult.created ? 0 : 1;

    child.items.forEach(([name, nameZh, slug], itemIndex) => {
      const itemResult = ensureCategory({
        parentId: childResult.id,
        name,
        nameZh,
        slug,
        sortOrder: itemIndex,
      });
      created += itemResult.created ? 1 : 0;
      updated += itemResult.created ? 0 : 1;
    });

    touchStmt.run(ts, ts, childResult.id);
  });

  touchStmt.run(ts, ts, rootResult.id);

  const summary = countDescendants(rootResult.id);
  db.exec("COMMIT");
  console.log(
    `apply-buildings-taxonomy: 完成。root_id=${rootResult.id}, level2=${summary.level2}, level3=${summary.level3}, total=${summary.total}, created=${created}, updated=${updated}`,
  );
} catch (error) {
  db.exec("ROLLBACK");
  console.error(error);
  process.exitCode = 1;
} finally {
  db.close();
}
