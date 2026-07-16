import Database from "better-sqlite3";

const db = new Database("data/local-admin.sqlite");
const now = new Date().toISOString();

const activateCommercialSlugs = [
  "restaurant",
  "cafe",
  "bakery",
  "grocery-store",
  "supermarket",
];

const bySlug = db.prepare(
  "SELECT id, parent_id, name, slug, sync_status FROM categories WHERE slug = ? AND deleted_at IS NULL",
);
const markUpdated = db.prepare(`
  UPDATE categories
  SET is_active = @is_active,
      updated_at = @now,
      local_updated_at = @now,
      sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
  WHERE id = @id
`);
const renameCategory = db.prepare(`
  UPDATE categories
  SET name = @name,
      slug = @slug,
      name_zh = @name_zh,
      updated_at = @now,
      local_updated_at = @now,
      sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
  WHERE id = @id
`);
const softDelete = db.prepare(`
  UPDATE categories
  SET is_active = 0,
      deleted_at = @now,
      updated_at = @now,
      local_updated_at = @now,
      sync_status = CASE
        WHEN remote_id IS NULL THEN 'pending_delete'
        ELSE 'pending_delete'
      END
  WHERE id = @id
`);

const changes = [];

db.transaction(() => {
  for (const slug of activateCommercialSlugs) {
    const record = bySlug.get(slug);
    if (!record) throw new Error(`Commercial child not found: ${slug}`);
    markUpdated.run({ id: record.id, is_active: 1, now });
    changes.push(`activated commercial-buildings/${slug}`);
  }

  const earlyHumans = bySlug.get("early-humans");
  if (!earlyHumans) throw new Error("Category not found: early-humans");
  renameCategory.run({
    id: earlyHumans.id,
    name: "Prehistoric People",
    slug: "prehistoric-people",
    name_zh: "史前人类",
    now,
  });
  changes.push("renamed early-humans -> prehistoric-people");

  const carnivorous = bySlug.get("carnivorous-dinosaurs");
  if (!carnivorous) throw new Error("Category not found: carnivorous-dinosaurs");
  softDelete.run({ id: carnivorous.id, now });
  changes.push("soft-deleted carnivorous-dinosaurs");
})();

console.log(`Applied ${changes.length} taxonomy cleanup changes.`);
for (const change of changes) console.log(`- ${change}`);
