/**
 * 根据 data/category-name-zh-seed.txt 批量写入 categories.name_zh（仅本地）。
 * 不写入 sync_outbox。请在 printly-admin 目录执行：node scripts/apply-category-name-zh.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");
const seedPath = path.join(root, "data", "category-name-zh-seed.txt");

const db = new Database(dbPath);
const cols = db.prepare("PRAGMA table_info(categories)").all();
const names = cols.map((c) => c.name);
if (!names.includes("name_zh")) {
  db.exec("ALTER TABLE categories ADD COLUMN name_zh TEXT NULL");
}

const nameToZh = new Map();
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
    nameToZh.set(en, zh);
  }
}

const upd = db.prepare(
  "UPDATE categories SET name_zh = ? WHERE name = ? AND deleted_at IS NULL",
);
let changed = 0;
db.transaction(() => {
  for (const [en, zh] of nameToZh) {
    changed += upd.run(zh, en).changes;
  }
})();

const total = db
  .prepare("SELECT COUNT(*) AS n FROM categories WHERE deleted_at IS NULL AND name_zh IS NOT NULL")
  .get().n;
db.close();

console.log(`apply-category-name-zh: 本次更新行数 ${changed}，当前有中文名的分类 ${total} 条。`);
