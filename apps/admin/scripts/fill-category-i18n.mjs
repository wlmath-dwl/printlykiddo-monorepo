/**
 * 1) 为所有分类写入 name_zh（一级二级优先 taxonomy.nameZh，其次缓存/种子，可选 Lingva 机翻）
 * 2) 一级、二级 description 置 NULL
 * 3) 严格「三级」分类（祖父为一级根）写入简短中文描述；四级及以下保持 NULL
 *
 * 用法（在 printly-admin 目录）：
 *   node scripts/fill-category-i18n.mjs
 *   node scripts/fill-category-i18n.mjs --fetch
 *   node scripts/fill-category-i18n.mjs --fetch --prefer-api
 *   node scripts/fill-category-i18n.mjs --fetch --refresh-stale  （已并入默认逻辑，可省略）
 * 环境变量 LINGVA_DELAY_MS 控制请求间隔（默认 650）。
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { translateEnToZhCn } from "./lib/lingva-translate.mjs";
import { animalsTaxonomy } from "./taxonomy-data/animals.mjs";
import { machinesTaxonomy } from "./taxonomy-data/machines.mjs";
import { dinosaursTaxonomy } from "./taxonomy-data/dinosaurs.mjs";
import { plantsTaxonomy, foodTaxonomy } from "./taxonomy-data/plants-food.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");
const seedPath = path.join(root, "data", "category-name-zh-seed.txt");
const cachePath = path.join(root, "data", "category-i18n-cache.json");

const doFetch = process.argv.includes("--fetch");
/** 调用 API 时优先机器翻译，再回退种子（用于「重新翻译」整库） */
const preferApi = process.argv.includes("--prefer-api");
/** name_zh 仍为英文或与英文名相同时强制重译 */
const refreshStale = process.argv.includes("--refresh-stale");
/** 请求间隔（毫秒），降低对 Lingva 的压力 */
const delayMs = Number(process.env.LINGVA_DELAY_MS || 650);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** 一级、二级英文名 -> 与 taxonomy 源数据一致的中文名 */
function buildTaxonomyL1L2Zh() {
  const m = new Map();
  for (const t of [
    animalsTaxonomy,
    machinesTaxonomy,
    dinosaursTaxonomy,
    plantsTaxonomy,
    foodTaxonomy,
  ]) {
    m.set(t.name, t.nameZh);
    for (const c of t.children) {
      m.set(c.name, c.nameZh);
    }
  }
  return m;
}

function loadSeed() {
  const map = new Map();
  if (!existsSync(seedPath)) {
    return map;
  }
  for (const line of readFileSync(seedPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) {
      continue;
    }
    const pipe = t.indexOf("|");
    if (pipe <= 0) {
      continue;
    }
    const en = t.slice(0, pipe).trim();
    const zh = t.slice(pipe + 1).trim();
    if (en && zh) {
      map.set(en, zh);
    }
  }
  return map;
}

function loadCache() {
  if (!existsSync(cachePath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(cachePath, "utf8"));
  } catch {
    return {};
  }
}

function saveCache(obj) {
  writeFileSync(cachePath, JSON.stringify(obj, null, 2), "utf8");
}

/** 三级描述：一句话，偏 SEO / 后台可读 */
function makeDescriptionZh(nameEn, nameZh) {
  return `可打印涂色与线稿素材主题：${nameZh}（${nameEn}），适合该分类下的儿童涂色页与简笔画练习。`;
}

/** 判断是否像未翻译的英文展示名 */
function looksLikeEnglishLabel(zh) {
  if (!zh || zh.length > 80) {
    return false;
  }
  const letters = zh.replace(/[^a-zA-Z]/g, "");
  return letters.length >= 3 && letters.length / zh.length > 0.45;
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const seedZh = loadSeed();
const taxonomyL1L2Zh = buildTaxonomyL1L2Zh();
let cache = loadCache();

const rows = db
  .prepare(
    `SELECT id, name, name_zh AS nameZhDb FROM categories WHERE deleted_at IS NULL ORDER BY id`,
  )
  .all();

const tierStmt = db.prepare(`
  SELECT CASE
    WHEN c.parent_id IS NULL THEN 1
    WHEN p.parent_id IS NULL THEN 2
    WHEN gp.parent_id IS NULL THEN 3
    ELSE 4
  END AS tier
  FROM categories c
  LEFT JOIN categories p ON p.id = c.parent_id AND p.deleted_at IS NULL
  LEFT JOIN categories gp ON gp.id = p.parent_id AND gp.deleted_at IS NULL
  WHERE c.id = ? AND c.deleted_at IS NULL
`);

const updFull = db.prepare(
  `UPDATE categories SET name_zh = ?, description = ?, updated_at = ?, local_updated_at = ?,
   sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ? AND deleted_at IS NULL`,
);

const ts = new Date().toISOString();
let apiCalls = 0;

try {
  for (const { id, name, nameZhDb } of rows) {
    const tier = Number(tierStmt.get(id)?.tier ?? 1);

    const cached = cache[name]?.zh;
    const seeded = seedZh.get(name);
    const taxL2 = tier <= 2 ? taxonomyL1L2Zh.get(name) : undefined;

    // 先合并静态来源；一级二级不走向导翻译（taxonomy/种子已覆盖）
    let zh = taxL2 ?? cached ?? seeded ?? null;

    const dbStillEnglish =
      nameZhDb === name || (nameZhDb && looksLikeEnglishLabel(nameZhDb));

    const needsMachine =
      doFetch &&
      (preferApi ||
        (tier >= 3 &&
          (zh == null ||
            zh === name ||
            looksLikeEnglishLabel(zh) ||
            (refreshStale && dbStillEnglish))));

    if (needsMachine) {
      await sleep(delayMs);
      try {
        const tzh = await translateEnToZhCn(name);
        apiCalls += 1;
        cache[name] = { ...(cache[name] || {}), zh: tzh };
        if (apiCalls % 25 === 0) {
          saveCache(cache);
          console.error(`fill-category-i18n: 已调用 API ${apiCalls} 次，已写入缓存。`);
        }
        if (preferApi || tier >= 3) {
          zh = tzh;
        }
      } catch (e) {
        console.error(`fill-category-i18n: 翻译失败 "${name}":`, e.message);
      }
    }

    if (!zh) {
      zh = name;
    }

    let description = null;
    if (tier === 3) {
      description = makeDescriptionZh(name, zh);
    }

    updFull.run(zh, description, ts, ts, id);
  }

  if (doFetch) {
    saveCache(cache);
  }
} finally {
  db.close();
}

console.log(
  `fill-category-i18n: 完成。更新 ${rows.length} 条；本次 API 调用 ${apiCalls} 次；缓存 ${cachePath}`,
);
