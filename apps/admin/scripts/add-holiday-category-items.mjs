import Database from "better-sqlite3";

const db = new Database("data/local-admin.sqlite");

const additions = {
  "popular-holidays": [
    ["Memorial Day", "memorial-day", "阵亡将士纪念日"],
    ["Labor Day", "labor-day", "劳动节"],
    ["Presidents' Day", "presidents-day", "总统日"],
    ["Veterans Day", "veterans-day", "退伍军人节"],
  ],
  "world-holidays": [
    ["Holi", "holi", "洒红节"],
    ["Ramadan", "ramadan", "斋月"],
    ["Eid al-Adha", "eid-al-adha", "宰牲节"],
    ["Passover", "passover", "逾越节"],
    ["Rosh Hashanah", "rosh-hashanah", "犹太新年"],
    ["Nowruz", "nowruz", "诺鲁孜节"],
  ],
  "school-days": [
    ["First Day of School", "first-day-of-school", "开学第一天"],
    ["Field Day", "field-day", "校园运动日"],
  ],
  "special-days": [
    ["Pi Day", "pi-day", "圆周率日"],
    ["World Environment Day", "world-environment-day", "世界环境日"],
    ["World Water Day", "world-water-day", "世界水日"],
  ],
};

const now = new Date().toISOString();

const holidays = db
  .prepare("SELECT id FROM categories WHERE parent_id IS NULL AND slug = ? AND deleted_at IS NULL")
  .get("holidays");

if (!holidays) {
  throw new Error("Root category not found: holidays");
}

const parentStmt = db.prepare(
  "SELECT id, slug FROM categories WHERE parent_id = ? AND slug = ? AND deleted_at IS NULL",
);
const existingSlugStmt = db.prepare(
  "SELECT id, name, slug FROM categories WHERE slug = ? AND deleted_at IS NULL LIMIT 1",
);
const maxSortStmt = db.prepare(
  "SELECT COALESCE(MAX(sort_order), -1) AS max_sort_order FROM categories WHERE parent_id = ? AND deleted_at IS NULL",
);
const insertStmt = db.prepare(`
  INSERT INTO categories (
    parent_id, name, slug, description, cover_image, sort_order, is_active,
    created_at, updated_at, sync_status, local_updated_at, remote_updated_at_snapshot,
    last_synced_at, deleted_at, name_zh, pose_prompt_specs, publish_to_pin, seo_image_url
  ) VALUES (
    @parent_id, @name, @slug, NULL, NULL, @sort_order, 0,
    @now, @now, 'pending_create', @now, NULL,
    NULL, NULL, @name_zh, NULL, 0, NULL
  )
`);

const inserted = [];
const skipped = [];

db.transaction(() => {
  for (const [parentSlug, items] of Object.entries(additions)) {
    const parent = parentStmt.get(holidays.id, parentSlug);
    if (!parent) throw new Error(`Second-level category not found: ${parentSlug}`);

    let sortOrder = maxSortStmt.get(parent.id).max_sort_order + 1;

    for (const [name, slug, nameZh] of items) {
      const existing = existingSlugStmt.get(slug);
      if (existing) {
        skipped.push(`${name} (${slug})`);
        continue;
      }

      insertStmt.run({
        parent_id: parent.id,
        name,
        slug,
        sort_order: sortOrder,
        name_zh: nameZh,
        now,
      });
      inserted.push(`${parentSlug}/${slug}`);
      sortOrder += 1;
    }
  }
})();

console.log(`Inserted ${inserted.length} holiday categories.`);
for (const item of inserted) console.log(`+ ${item}`);
if (skipped.length) {
  console.log(`Skipped ${skipped.length} existing slugs.`);
  for (const item of skipped) console.log(`= ${item}`);
}
