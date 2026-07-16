/**
 * 一次性：给当前 Dinosaurs / 恐龙 的所有二级分类补充候选三级词条。
 *
 * 只新增/更新分类词数据，不生成图片；新增词条默认 is_active = 0。
 *
 * 在 printly-admin 目录执行：
 *   node scripts/apply-dinosaur-l3-word-expansion-inactive.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");

const groups = [
  {
    parentSlug: "allosaur-dinosaurs",
    items: [
      ["Concavenator", "昆卡猎龙", "concavenator"],
      ["Metriacanthosaurus", "中棘龙", "metriacanthosaurus"],
      ["Mapusaurus", "马普龙", "mapusaurus"],
    ],
  },
  {
    parentSlug: "ceratosaur-dinosaurs",
    items: [
      ["Majungasaurus", "玛君龙", "majungasaurus"],
    ],
  },
  {
    parentSlug: "early-theropod-dinosaurs",
    items: [
      ["Cryolophosaurus", "冰脊龙", "cryolophosaurus"],
      ["Monolophosaurus", "单脊龙", "monolophosaurus"],
    ],
  },
  {
    parentSlug: "long-neck-dinosaurs",
    items: [
      ["Nigersaurus", "尼日尔龙", "nigersaurus"],
      ["Amargasaurus", "阿马加龙", "amargasaurus"],
      ["Giraffatitan", "长颈巨龙", "giraffatitan"],
      ["Dreadnoughtus", "无畏龙", "dreadnoughtus"],
      ["Patagotitan", "巴塔哥巨龙", "patagotitan"],
      ["Saltasaurus", "萨尔塔龙", "saltasaurus"],
    ],
  },
  {
    parentSlug: "horned-dinosaurs",
    items: [
      ["Pentaceratops", "五角龙", "pentaceratops"],
      ["Einiosaurus", "野牛龙", "einiosaurus"],
      ["Achelousaurus", "河神龙", "achelousaurus"],
      ["Nasutoceratops", "大鼻角龙", "nasutoceratops"],
      ["Kosmoceratops", "华丽角龙", "kosmoceratops"],
      ["Zuniceratops", "祖尼角龙", "zuniceratops"],
    ],
  },
  {
    parentSlug: "armored-dinosaurs",
    items: [
      ["Sauropelta", "蜥结龙", "sauropelta"],
      ["Borealopelta", "北方盾龙", "borealopelta"],
      ["Minmi", "敏迷龙", "minmi"],
      ["Talarurus", "篮尾龙", "talarurus"],
      ["Pinacosaurus", "绘龙", "pinacosaurus"],
      ["Zuul", "祖鲁龙", "zuul"],
    ],
  },
  {
    parentSlug: "plated-dinosaurs",
    items: [
      ["Miragaia", "米拉加亚龙", "miragaia"],
      ["Dacentrurus", "锐龙", "dacentrurus"],
      ["Chungkingosaurus", "重庆龙", "chungkingosaurus"],
      ["Chialingosaurus", "嘉陵龙", "chialingosaurus"],
      ["Gigantspinosaurus", "巨刺龙", "gigantspinosaurus"],
      ["Lexovisaurus", "勒苏维斯龙", "lexovisaurus"],
    ],
  },
  {
    parentSlug: "dome-head-dinosaurs",
    items: [
      ["Prenocephale", "倾头龙", "prenocephale"],
      ["Sphaerotholus", "圆顶龙", "sphaerotholus"],
      ["Tylocephale", "肿头龙", "tylocephale"],
      ["Acrotholus", "高圆顶龙", "acrotholus"],
      ["Colepiocephale", "盔头龙", "colepiocephale"],
      ["Wannanosaurus", "皖南龙", "wannanosaurus"],
    ],
  },
  {
    parentSlug: "raptors",
    items: [
      ["Dakotaraptor", "达科他盗龙", "dakotaraptor"],
      ["Atrociraptor", "恶灵龙", "atrociraptor"],
      ["Pyroraptor", "火盗龙", "pyroraptor"],
      ["Austroraptor", "南方盗龙", "austroraptor"],
      ["Sinornithosaurus", "中国鸟龙", "sinornithosaurus"],
      ["Zhenyuanlong", "振元龙", "zhenyuanlong"],
    ],
  },
  {
    parentSlug: "therizinosaurs",
    items: [
      ["Suzhousaurus", "苏州龙", "suzhousaurus"],
      ["Neimongosaurus", "内蒙古龙", "neimongosaurus"],
      ["Enigmosaurus", "谜龙", "enigmosaurus"],
      ["Erliansaurus", "二连龙", "erliansaurus"],
      ["Martharaptor", "玛莎盗龙", "martharaptor"],
      ["Nanshiungosaurus", "南雄龙", "nanshiungosaurus"],
    ],
  },
  {
    parentSlug: "ornithomimosaurs",
    items: [
      ["Shenzhousaurus", "神州龙", "shenzhousaurus"],
      ["Beishanlong", "北山龙", "beishanlong"],
      ["Garudimimus", "似金翅鸟龙", "garudimimus"],
      ["Harpymimus", "哈比龙", "harpymimus"],
      ["Nqwebasaurus", "恩奎巴龙", "nqwebasaurus"],
      ["Hexing", "和兴龙", "hexing"],
    ],
  },
  {
    parentSlug: "duck-billed-dinosaurs",
    items: [
      ["Saurolophus", "栉龙", "saurolophus"],
      ["Gryposaurus", "钩鼻龙", "gryposaurus"],
      ["Shantungosaurus", "山东龙", "shantungosaurus"],
      ["Brachylophosaurus", "短冠龙", "brachylophosaurus"],
      ["Hypacrosaurus", "亚冠龙", "hypacrosaurus"],
      ["Olorotitan", "谭氏龙", "olorotitan"],
    ],
  },
  {
    parentSlug: "small-ornithopods",
    items: [
      ["Oryctodromeus", "掘奔龙", "oryctodromeus"],
      ["Changchunsaurus", "长春龙", "changchunsaurus"],
      ["Jeholosaurus", "热河龙", "jeholosaurus"],
      ["Haya", "哈雅龙", "haya"],
      ["Agilisaurus", "灵龙", "agilisaurus"],
      ["Atlascopcosaurus", "阿特拉斯科普柯龙", "atlascopcosaurus"],
    ],
  },
];

function nowIso() {
  return new Date().toISOString();
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const ts = nowIso();

const getCategoryBySlug = db.prepare(
  "SELECT id, slug FROM categories WHERE slug = ? AND deleted_at IS NULL ORDER BY id ASC LIMIT 1",
);

const maxSortOrderByParent = db.prepare(
  "SELECT COALESCE(MAX(sort_order), -1) AS maxSortOrder FROM categories WHERE parent_id = ? AND deleted_at IS NULL",
);

const insertInactive = db.prepare(
  `INSERT INTO categories (
    remote_id, parent_id, name, slug, description, name_zh, cover_image,
    sort_order, is_active, created_at, updated_at, sync_status,
    local_updated_at, remote_updated_at_snapshot, last_synced_at, deleted_at
  ) VALUES (NULL, ?, ?, ?, NULL, ?, NULL, ?, 0, ?, ?, 'pending_create', ?, NULL, NULL, NULL)`,
);

const updateInactive = db.prepare(
  `UPDATE categories
   SET parent_id = ?, name = ?, slug = ?, name_zh = ?, sort_order = ?,
       is_active = 0, deleted_at = NULL, updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);

const touchCategory = db.prepare(
  `UPDATE categories
   SET updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);

try {
  db.exec("BEGIN IMMEDIATE");

  let inserted = 0;
  let updated = 0;
  let skippedParents = 0;

  for (const group of groups) {
    const parent = getCategoryBySlug.get(group.parentSlug);
    if (!parent) {
      console.warn(`Parent category not found: ${group.parentSlug}`);
      skippedParents += 1;
      continue;
    }

    let nextSortOrder = Number(maxSortOrderByParent.get(parent.id)?.maxSortOrder ?? -1) + 1;

    for (const [name, nameZh, slug] of group.items) {
      const existing = getCategoryBySlug.get(slug);
      if (existing) {
        updateInactive.run(parent.id, name, slug, nameZh, nextSortOrder, ts, ts, existing.id);
        updated += 1;
      } else {
        insertInactive.run(parent.id, name, slug, nameZh, nextSortOrder, ts, ts, ts);
        inserted += 1;
      }
      nextSortOrder += 1;
    }

    touchCategory.run(ts, ts, parent.id);
  }

  const dinosaurs = getCategoryBySlug.get("dinosaurs");
  if (dinosaurs) {
    touchCategory.run(ts, ts, dinosaurs.id);
  }

  db.exec("COMMIT");
  console.log(
    `apply-dinosaur-l3-word-expansion-inactive: 完成。inserted=${inserted}, updated=${updated}, skippedParents=${skippedParents}`,
  );
} catch (error) {
  db.exec("ROLLBACK");
  console.error(error);
  process.exit(1);
} finally {
  db.close();
}
