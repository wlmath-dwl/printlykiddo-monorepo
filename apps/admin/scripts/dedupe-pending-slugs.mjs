/**
 * 同步前的 slug 全局查重守卫。
 * 远端 D1 对 categories.slug 是全局 UNIQUE，但本地是普通索引，允许跨父重名。
 * 本脚本找出所有全局重复的 slug，并把其中【待同步】的那一/几行改名为全局唯一
 * （沿用代码库已有的 `-2 / -3` 数字后缀约定），已同步(synced)的行保持不动
 * 以免破坏线上 URL。
 *
 * 建议：每次批量新增分类后、点同步前，先跑一次本脚本。
 * 执行：node scripts/dedupe-pending-slugs.mjs
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
const ts = nowIso();

const rows = db
  .prepare("SELECT id, slug, sync_status FROM categories WHERE deleted_at IS NULL")
  .all();

// 当前所有已占用的 slug 集合
const taken = new Set(rows.map((r) => r.slug));

// 按 slug 分组，找重复
const bySlug = new Map();
for (const r of rows) {
  const list = bySlug.get(r.slug) ?? [];
  list.push(r);
  bySlug.set(r.slug, list);
}

function makeUnique(base) {
  let i = 2;
  let candidate = `${base}-${i}`;
  while (taken.has(candidate)) {
    i += 1;
    candidate = `${base}-${i}`;
  }
  return candidate;
}

const update = db.prepare(
  `UPDATE categories SET slug = ?, updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);

const changes = [];

try {
  db.exec("BEGIN IMMEDIATE");

  for (const [slug, group] of bySlug) {
    if (group.length < 2) continue;

    // 保留优先级：synced 优先保留原 slug；其余按 id 升序保留第一个
    const synced = group.filter((r) => r.sync_status === "synced");
    const keepId =
      synced.length > 0
        ? Math.min(...synced.map((r) => r.id))
        : Math.min(...group.map((r) => r.id));

    for (const r of group) {
      if (r.id === keepId) continue;
      if (r.sync_status === "synced") {
        // 两个都已同步理论上不该发生（远端唯一）；跳过不动，仅告警
        console.warn(`⚠ slug "${slug}" 有多个 synced 行(id=${r.id})，需人工处理。`);
        continue;
      }
      const next = makeUnique(slug);
      taken.delete(r.slug); // 旧 slug 若无人用可释放（保守起见不删，taken 保留）
      taken.add(next);
      update.run(next, ts, ts, r.id);
      changes.push({ id: r.id, from: slug, to: next });
    }
  }

  db.exec("COMMIT");
} catch (e) {
  db.exec("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  db.close();
}

if (changes.length === 0) {
  console.log("dedupe-pending-slugs: 无全局重复 slug，无需改动。");
} else {
  console.log(`dedupe-pending-slugs: 改名 ${changes.length} 条：`);
  for (const c of changes) console.log(`  #${c.id}  ${c.from}  ->  ${c.to}`);
}
