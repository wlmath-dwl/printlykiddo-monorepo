/**
 * 一次性：按长期 SEO / 儿童素材入口规划重构 Dinosaurs / 恐龙 二级分类。
 *
 * - 下线 Carnivorous Dinosaurs，不再作为二级容器
 * - 新建更具体的兽脚类二级
 * - 把现有三级恐龙重挂到新的二级分类下
 * - 保留每个三级原有 is_active 状态，避免还没生成素材的词条被打开
 *
 * 在 printly-admin 目录执行：
 *   node scripts/apply-dinosaur-taxonomy-restructure.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");

const l2Plan = [
  ["tyrannosaur-dinosaurs", "Tyrannosaur Dinosaurs", "暴龙类", 1, 1],
  ["spinosaur-dinosaurs", "Spinosaur Dinosaurs", "棘龙类", 2, 1],
  ["allosaur-dinosaurs", "Allosaur Dinosaurs", "异特龙类", 3, 1],
  ["ceratosaur-dinosaurs", "Ceratosaur Dinosaurs", "角鼻龙类", 4, 1],
  ["megalosaur-dinosaurs", "Megalosaur Dinosaurs", "斑龙类", 5, 1],
  ["early-theropod-dinosaurs", "Early Theropod Dinosaurs", "早期兽脚类", 6, 1],
  ["raptors", "Raptors", "迅猛龙类", 7, 1],
  ["oviraptor-dinosaurs", "Oviraptor Dinosaurs", "窃蛋龙类", 8, 1],
  ["therizinosaurs", "Therizinosaurs", "镰刀龙类", 9, 0],
  ["ornithomimosaurs", "Ostrich Dinosaurs", "似鸟龙类", 10, 0],
  ["long-neck-dinosaurs", "Long Neck Dinosaurs", "长颈恐龙", 11, 1],
  ["horned-dinosaurs", "Horned Dinosaurs", "角龙类", 12, 1],
  ["duck-billed-dinosaurs", "Duck-Billed Dinosaurs", "鸭嘴龙类", 13, 1],
  ["iguanodont-dinosaurs", "Iguanodont Dinosaurs", "禽龙类", 14, 0],
  ["small-ornithopods", "Small Plant-Eating Dinosaurs", "小型植食恐龙", 15, 0],
  ["plated-dinosaurs", "Plated Dinosaurs", "剑龙类", 16, 1],
  ["armored-dinosaurs", "Armored Dinosaurs", "甲龙类", 17, 1],
  ["dome-head-dinosaurs", "Dome Head Dinosaurs", "肿头龙类", 18, 1],
];

const l3Plan = {
  "tyrannosaur-dinosaurs": [
    "t-rex",
    "albertosaurus",
    "gorgosaurus",
    "daspletosaurus",
    "tarbosaurus",
    "alioramus",
    "qianzhousaurus",
    "lythronax",
  ],
  "spinosaur-dinosaurs": [
    "suchomimus",
    "irritator",
    "oxalaia",
    "spinosaurus",
    "baryonyx",
    "ichthyovenator",
    "sigilmassasaurus",
    "cristatusaurus",
  ],
  "allosaur-dinosaurs": [
    "acrocanthosaurus",
    "giganotosaurus",
    "saurophaganax",
    "neovenator",
    "concavenator",
    "mapusaurus",
    "yangchuanosaurus",
    "metriacanthosaurus",
  ],
  "ceratosaur-dinosaurs": [
    "ceratosaurus",
    "carnotaurus",
    "majungasaurus",
    "abelisaurus",
    "rajasaurus",
    "rugops",
    "skorpiovenator",
    "masiakasaurus",
  ],
  "megalosaur-dinosaurs": [
    "megalosaurus",
    "torvosaurus",
    "afrovenator",
    "eustreptospondylus",
    "dubreuillosaurus",
    "duriavenator",
    "wiehenvenator",
    "marshosaurus",
  ],
  "early-theropod-dinosaurs": [
    "dilophosaurus",
    "cryolophosaurus",
    "monolophosaurus",
    "coelophysis",
    "herrerasaurus",
    "eoraptor",
    "liliensternus",
    "zupaysaurus",
  ],
  raptors: [
    "velociraptor",
    "deinonychus",
    "utahraptor",
    "dromaeosaurus",
    "microraptor",
    "bambiraptor",
    "dakotaraptor",
    "atrociraptor",
    "pyroraptor",
    "austroraptor",
    "sinornithosaurus",
    "zhenyuanlong",
  ],
  "oviraptor-dinosaurs": [
    "oviraptor",
    "citipati",
    "anzu",
    "conchoraptor",
    "khaan",
    "gigantoraptor",
    "caudipteryx",
    "chirostenotes",
  ],
  therizinosaurs: [
    "therizinosaurus",
    "beipiaosaurus",
    "nothronychus",
    "erlikosaurus",
    "segnosaurus",
    "alxasaurus",
    "falcarius",
    "jianchangosaurus",
    "suzhousaurus",
    "neimongosaurus",
    "enigmosaurus",
    "erliansaurus",
    "martharaptor",
    "nanshiungosaurus",
  ],
  ornithomimosaurs: [
    "gallimimus",
    "ornithomimus",
    "struthiomimus",
    "deinocheirus",
    "anserimimus",
    "archaeornithomimus",
    "sinornithomimus",
    "pelecanimimus",
    "shenzhousaurus",
    "beishanlong",
    "garudimimus",
    "harpymimus",
    "nqwebasaurus",
    "hexing",
  ],
  "long-neck-dinosaurs": [
    "apatosaurus",
    "diplodocus",
    "brachiosaurus",
    "argentinosaurus",
    "brontosaurus",
    "barosaurus",
    "supersaurus",
    "sauroposeidon",
    "mamenchisaurus",
    "camarasaurus",
    "nigersaurus",
    "amargasaurus",
    "giraffatitan",
    "dreadnoughtus",
    "patagotitan",
    "saltasaurus",
  ],
  "horned-dinosaurs": [
    "triceratops",
    "chasmosaurus",
    "styracosaurus",
    "protoceratops",
    "torosaurus",
    "centrosaurus",
    "pachyrhinosaurus",
    "diabloceratops",
    "pentaceratops",
    "einiosaurus",
    "achelousaurus",
    "nasutoceratops",
    "kosmoceratops",
    "zuniceratops",
  ],
  "duck-billed-dinosaurs": [
    "parasaurolophus",
    "edmontosaurus",
    "lambeosaurus",
    "corythosaurus",
    "hadrosaurus",
    "maiasaura",
    "saurolophus",
    "gryposaurus",
    "shantungosaurus",
    "brachylophosaurus",
    "hypacrosaurus",
    "olorotitan",
  ],
  "iguanodont-dinosaurs": [
    "iguanodon",
    "mantellisaurus",
    "ouranosaurus",
    "tenontosaurus",
    "camptosaurus",
    "muttaburrasaurus",
    "fukuisaurus",
    "lurdusaurus",
  ],
  "small-ornithopods": [
    "hypsilophodon",
    "dryosaurus",
    "leaellynasaura",
    "othnielia",
    "parksosaurus",
    "thescelosaurus",
    "orodromeus",
    "zephyrosaurus",
    "oryctodromeus",
    "changchunsaurus",
    "jeholosaurus",
    "haya",
    "agilisaurus",
    "atlascopcosaurus",
  ],
  "plated-dinosaurs": [
    "stegosaurus",
    "hesperosaurus",
    "wuerhosaurus",
    "kentrosaurus",
    "tuojiangosaurus",
    "huayangosaurus",
    "miragaia",
    "dacentrurus",
    "chungkingosaurus",
    "chialingosaurus",
    "gigantspinosaurus",
    "lexovisaurus",
  ],
  "armored-dinosaurs": [
    "ankylosaurus",
    "euoplocephalus",
    "nodosaurus",
    "polacanthus",
    "saichania",
    "edmontonia",
    "gargoyleosaurus",
    "sauropelta",
    "borealopelta",
    "minmi",
    "talarurus",
    "pinacosaurus",
    "zuul",
  ],
  "dome-head-dinosaurs": [
    "pachycephalosaurus",
    "stygimoloch",
    "dracorex",
    "homalocephale",
    "stegoceras",
    "goyocephale",
    "prenocephale",
    "sphaerotholus",
    "tylocephale",
    "acrotholus",
    "colepiocephale",
    "wannanosaurus",
  ],
};

function nowIso() {
  return new Date().toISOString();
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const ts = nowIso();
const getBySlug = db.prepare(
  "SELECT * FROM categories WHERE slug = ? ORDER BY deleted_at IS NOT NULL ASC, id ASC LIMIT 1",
);
const insertCategory = db.prepare(
  `INSERT INTO categories (
    remote_id, parent_id, name, slug, description, name_zh, cover_image,
    sort_order, is_active, created_at, updated_at, sync_status,
    local_updated_at, remote_updated_at_snapshot, last_synced_at, deleted_at
  ) VALUES (NULL, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, 'pending_create', ?, NULL, NULL, NULL)`,
);
const updateCategory = db.prepare(
  `UPDATE categories
   SET parent_id = ?, name = ?, slug = ?, name_zh = ?, sort_order = ?, is_active = ?,
       deleted_at = NULL, updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);
const moveChild = db.prepare(
  `UPDATE categories
   SET parent_id = ?, sort_order = ?, updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);
const deactivateCategory = db.prepare(
  `UPDATE categories
   SET is_active = 0, sort_order = ?, updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);

function ensureL2(rootId, [slug, name, nameZh, sortOrder, isActive]) {
  const existing = getBySlug.get(slug);
  if (existing) {
    updateCategory.run(
      rootId,
      name,
      slug,
      nameZh,
      sortOrder,
      isActive,
      ts,
      ts,
      existing.id,
    );
    return Number(existing.id);
  }

  const result = insertCategory.run(
    rootId,
    name,
    slug,
    nameZh,
    sortOrder,
    isActive,
    ts,
    ts,
    ts,
  );
  return Number(result.lastInsertRowid);
}

try {
  db.exec("BEGIN IMMEDIATE");

  const dinosaurs = getBySlug.get("dinosaurs");
  if (!dinosaurs || dinosaurs.deleted_at) {
    throw new Error("Dinosaurs root category not found.");
  }

  const l2Ids = new Map();
  for (const item of l2Plan) {
    l2Ids.set(item[0], ensureL2(dinosaurs.id, item));
  }

  let moved = 0;
  const missing = [];
  for (const [parentSlug, childSlugs] of Object.entries(l3Plan)) {
    const parentId = l2Ids.get(parentSlug);
    if (!parentId) {
      missing.push(`missing parent ${parentSlug}`);
      continue;
    }

    childSlugs.forEach((childSlug, index) => {
      const child = getBySlug.get(childSlug);
      if (!child || child.deleted_at) {
        missing.push(childSlug);
        return;
      }
      moveChild.run(parentId, index, ts, ts, child.id);
      moved += 1;
    });
  }

  const carnivorous = getBySlug.get("carnivorous-dinosaurs");
  if (carnivorous && !carnivorous.deleted_at) {
    deactivateCategory.run(99, ts, ts, carnivorous.id);
  }

  updateCategory.run(
    null,
    "Dinosaurs",
    "dinosaurs",
    "恐龙",
    2,
    1,
    ts,
    ts,
    dinosaurs.id,
  );

  db.exec("COMMIT");
  console.log(
    `apply-dinosaur-taxonomy-restructure: 完成。l2=${l2Ids.size}, moved=${moved}, missing=${missing.length}`,
  );
  if (missing.length > 0) {
    console.warn(`Missing slugs: ${missing.join(", ")}`);
  }
} catch (error) {
  db.exec("ROLLBACK");
  console.error(error);
  process.exit(1);
} finally {
  db.close();
}
