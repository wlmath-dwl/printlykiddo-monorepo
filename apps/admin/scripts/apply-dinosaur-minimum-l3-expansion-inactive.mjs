/**
 * 一次性：补齐 Dinosaurs / 恐龙 下少于 8 个三级词条的二级分类。
 *
 * 只新增候选词条，不生成图片；新增词条默认 is_active = 0。
 *
 * 在 printly-admin 目录执行：
 *   node scripts/apply-dinosaur-minimum-l3-expansion-inactive.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");

const groups = [
  {
    parentSlug: "tyrannosaur-dinosaurs",
    items: [
      ["Alioramus", "分支龙", "alioramus"],
      ["Qianzhousaurus", "虔州龙", "qianzhousaurus"],
      ["Lythronax", "血王龙", "lythronax"],
    ],
  },
  {
    parentSlug: "spinosaur-dinosaurs",
    items: [
      ["Spinosaurus", "棘龙", "spinosaurus"],
      ["Baryonyx", "重爪龙", "baryonyx"],
      ["Ichthyovenator", "鱼猎龙", "ichthyovenator"],
      ["Sigilmassasaurus", "斯基玛萨龙", "sigilmassasaurus"],
      ["Cristatusaurus", "冠鳄龙", "cristatusaurus"],
    ],
  },
  {
    parentSlug: "ceratosaur-dinosaurs",
    items: [
      ["Abelisaurus", "阿贝力龙", "abelisaurus"],
      ["Rajasaurus", "胜王龙", "rajasaurus"],
      ["Rugops", "皱褶龙", "rugops"],
      ["Skorpiovenator", "蝎猎龙", "skorpiovenator"],
      ["Masiakasaurus", "怪齿龙", "masiakasaurus"],
    ],
  },
  {
    parentSlug: "megalosaur-dinosaurs",
    items: [
      ["Afrovenator", "非洲猎龙", "afrovenator"],
      ["Eustreptospondylus", "美扭椎龙", "eustreptospondylus"],
      ["Dubreuillosaurus", "杜布雷龙", "dubreuillosaurus"],
      ["Duriavenator", "多塞特猎龙", "duriavenator"],
      ["Wiehenvenator", "维恩猎龙", "wiehenvenator"],
      ["Marshosaurus", "马什龙", "marshosaurus"],
    ],
  },
  {
    parentSlug: "early-theropod-dinosaurs",
    items: [
      ["Coelophysis", "腔骨龙", "coelophysis"],
      ["Herrerasaurus", "埃雷拉龙", "herrerasaurus"],
      ["Eoraptor", "始盗龙", "eoraptor"],
      ["Liliensternus", "理理恩龙", "liliensternus"],
      ["Zupaysaurus", "祖派龙", "zupaysaurus"],
    ],
  },
  {
    parentSlug: "oviraptor-dinosaurs",
    items: [
      ["Citipati", "葬火龙", "citipati"],
      ["Anzu", "安祖龙", "anzu"],
      ["Conchoraptor", "偷贝龙", "conchoraptor"],
      ["Khaan", "可汗龙", "khaan"],
      ["Gigantoraptor", "巨盗龙", "gigantoraptor"],
      ["Caudipteryx", "尾羽龙", "caudipteryx"],
      ["Chirostenotes", "细爪龙", "chirostenotes"],
    ],
  },
  {
    parentSlug: "iguanodont-dinosaurs",
    items: [
      ["Mantellisaurus", "曼特尔龙", "mantellisaurus"],
      ["Ouranosaurus", "豪勇龙", "ouranosaurus"],
      ["Tenontosaurus", "腱龙", "tenontosaurus"],
      ["Camptosaurus", "弯龙", "camptosaurus"],
      ["Muttaburrasaurus", "木他布拉龙", "muttaburrasaurus"],
      ["Fukuisaurus", "福井龙", "fukuisaurus"],
      ["Lurdusaurus", "笨重龙", "lurdusaurus"],
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
    `apply-dinosaur-minimum-l3-expansion-inactive: 完成。inserted=${inserted}, updated=${updated}, skippedParents=${skippedParents}`,
  );
} catch (error) {
  db.exec("ROLLBACK");
  console.error(error);
  process.exit(1);
} finally {
  db.close();
}
