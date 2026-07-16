import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import slugify from "slugify";

import { getLocalDatabase } from "@/lib/admin-db";
import { ACTIVITY_ITEM_DESCRIPTION_ZH, ACTIVITY_ITEM_SEED, ACTIVITY_ITEM_SUPPLEMENT, ACTIVITY_TOPIC_DESCRIPTION_ZH, ACTIVITY_TOPIC_GROUP_SEED } from "@/lib/activity-item-seed";
import {
  ASSET_STATUSES,
  ASSET_TYPES,
  ITEM_STATUSES,
  TOPIC_STATUSES,
  type ActivityAsset,
  type ActivityAssetInput,
  type ActivityItem,
  type ActivityItemInput,
  type ActivityImageVariants,
  type ActivityTag,
  type ActivityTagInput,
  type ActivityTopic,
  type ActivityTopicInput,
  type AssetStatus,
  type AssetType,
  type ItemStatus,
  type TopicStatus,
} from "@/lib/activity-item-types";

export type {
  ActivityAsset,
  ActivityAssetInput,
  ActivityItem,
  ActivityItemInput,
  ActivityTag,
  ActivityTagInput,
  ActivityTopic,
  ActivityTopicInput,
  AssetStatus,
  AssetType,
  ItemStatus,
  TopicStatus,
} from "@/lib/activity-item-types";

const SCHEMA_VERSION = "8";
const ASSET_DIR = path.join(process.cwd(), "data", "activity-items");

function timestamp() {
  return new Date().toISOString();
}

function database() {
  const db = getLocalDatabase();
  db.exec("CREATE TABLE IF NOT EXISTS activity_library_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  const version = db.prepare("SELECT value FROM activity_library_meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
  if (!version || !["2", "3", "4", "5", "6", "7", SCHEMA_VERSION].includes(version.value)) migrateAndSeed(db);
  else {
    let currentVersion = version.value;
    if (currentVersion === "2") { upgradeFromV2(db); currentVersion = "3"; }
    if (currentVersion === "3") { upgradeFromV3(db); currentVersion = "4"; }
    if (currentVersion === "4") { upgradeFromV4(db); currentVersion = "5"; }
    if (currentVersion === "5") { upgradeFromV5(db); currentVersion = "6"; }
    if (currentVersion === "6") { upgradeFromV6(db); currentVersion = "7"; }
    if (currentVersion === "7") upgradeFromV7(db);
  }
  return db;
}

function upgradeFromV2(db: ReturnType<typeof getLocalDatabase>) {
  db.transaction(() => {
    db.exec("ALTER TABLE activity_topics ADD COLUMN cover_path TEXT NULL");
    db.exec("ALTER TABLE activity_topics ADD COLUMN cover_variants TEXT NOT NULL DEFAULT '{}'");
    db.exec("ALTER TABLE activity_assets ADD COLUMN variants TEXT NOT NULL DEFAULT '{}'");
    db.prepare("UPDATE activity_library_meta SET value = '3' WHERE key = 'schema_version'").run();
  })();
}

function upgradeFromV3(db: ReturnType<typeof getLocalDatabase>) {
  db.transaction(() => {
    db.exec("ALTER TABLE activity_items ADD COLUMN description TEXT NULL");
    const updateTopic = db.prepare("UPDATE activity_topics SET description = ?, updated_at = ? WHERE slug = ?");
    const updateItem = db.prepare("UPDATE activity_items SET description = ?, updated_at = ? WHERE slug = ?");
    const now = timestamp();
    Object.entries(ACTIVITY_TOPIC_DESCRIPTION_ZH).forEach(([slug, description]) => updateTopic.run(description, now, slug));
    Object.entries(ACTIVITY_ITEM_DESCRIPTION_ZH).forEach(([slug, description]) => updateItem.run(description, now, slug));
    db.prepare("UPDATE activity_library_meta SET value = '4' WHERE key = 'schema_version'").run();
  })();
}

function upgradeFromV4(db: ReturnType<typeof getLocalDatabase>) {
  db.transaction(() => {
    seedSupplement(db, timestamp());
    db.prepare("UPDATE activity_library_meta SET value = '5' WHERE key = 'schema_version'").run();
  })();
}

function upgradeFromV5(db: ReturnType<typeof getLocalDatabase>) {
  db.transaction(() => {
    db.exec("DROP TABLE IF EXISTS activity_item_tags; DROP TABLE IF EXISTS activity_topic_tags; DROP TABLE IF EXISTS activity_tags;");
    db.exec("UPDATE activity_topics SET group_name = NULL");
    createTopicTagTables(db);
    seedTopicGroups(db);
    db.prepare("UPDATE activity_library_meta SET value = '6' WHERE key = 'schema_version'").run();
  })();
}

function upgradeFromV6(db: ReturnType<typeof getLocalDatabase>) {
  db.transaction(() => {
    db.exec("UPDATE activity_topics SET group_name = NULL");
    db.prepare("UPDATE activity_library_meta SET value = '7' WHERE key = 'schema_version'").run();
  })();
}

function upgradeFromV7(db: ReturnType<typeof getLocalDatabase>) {
  db.transaction(() => {
    db.exec("DELETE FROM activity_topic_tags; DELETE FROM activity_tags;");
    seedTopicGroups(db);
    db.prepare("UPDATE activity_library_meta SET value = ? WHERE key = 'schema_version'").run(SCHEMA_VERSION);
  })();
}

function createTopicTagTables(db: ReturnType<typeof getLocalDatabase>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS activity_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS activity_topic_tags (
      topic_id INTEGER PRIMARY KEY,
      tag_id INTEGER NOT NULL,
      FOREIGN KEY (topic_id) REFERENCES activity_topics(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES activity_tags(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_activity_topic_tags_tag ON activity_topic_tags(tag_id);
  `);
}

function seedTopicGroups(db: ReturnType<typeof getLocalDatabase>) {
  const insertTag = db.prepare("INSERT OR IGNORE INTO activity_tags (name, slug, description, sort_order) VALUES (?, ?, ?, ?)");
  const findTag = db.prepare("SELECT id FROM activity_tags WHERE slug = ?");
  const findTopic = db.prepare("SELECT id FROM activity_topics WHERE slug = ?");
  const assign = db.prepare("INSERT OR REPLACE INTO activity_topic_tags (topic_id, tag_id) VALUES (?, ?)");
  ACTIVITY_TOPIC_GROUP_SEED.forEach((group, index) => {
    insertTag.run(group.name, group.slug, group.description, index + 1);
    const tagId = (findTag.get(group.slug) as { id: number }).id;
    group.topicSlugs.forEach((slug) => {
      const topic = findTopic.get(slug) as { id: number } | undefined;
      if (!topic) throw new Error(`Topic 分组 ${group.name} 引用了不存在的 Topic: ${slug}`);
      assign.run(topic.id, tagId);
    });
  });
}

function seedSupplement(db: ReturnType<typeof getLocalDatabase>, now: string) {
  const insertTopic = db.prepare(`INSERT OR IGNORE INTO activity_topics
    (name, slug, group_name, description, icon, sort_order, status, created_at, updated_at)
    VALUES (?, ?, NULL, ?, ?, ?, 'published', ?, ?)`);
  const findTopic = db.prepare("SELECT id FROM activity_topics WHERE slug = ?");
  const insertItem = db.prepare(`INSERT OR IGNORE INTO activity_items
    (name, slug, word, description, related_words, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, '[]', 'published', ?, ?)`);
  const findItem = db.prepare("SELECT id FROM activity_items WHERE slug = ?");
  const insertRelation = db.prepare("INSERT OR IGNORE INTO activity_item_topics (topic_id, item_id) VALUES (?, ?)");
  let sortOrder = Number((db.prepare("SELECT COALESCE(MAX(sort_order), 0) AS value FROM activity_topics").get() as { value: number }).value);

  for (const topic of ACTIVITY_ITEM_SUPPLEMENT) {
    insertTopic.run(topic.name, topic.slug, ACTIVITY_TOPIC_DESCRIPTION_ZH[topic.slug] || null, topic.icon, ++sortOrder, now, now);
    const topicId = (findTopic.get(topic.slug) as { id: number }).id;
    for (const [slug, name, word] of topic.newItems || []) {
      insertItem.run(name, slug, word, ACTIVITY_ITEM_DESCRIPTION_ZH[slug] || null, now, now);
    }
    for (const slug of [...topic.itemSlugs, ...(topic.newItems || []).map(([itemSlug]) => itemSlug)]) {
      const item = findItem.get(slug) as { id: number } | undefined;
      if (!item) throw new Error(`补充主题 ${topic.name} 引用了不存在的 Item: ${slug}`);
      insertRelation.run(topicId, item.id);
    }
  }
}

function migrateAndSeed(db: ReturnType<typeof getLocalDatabase>) {
  db.transaction(() => {
    db.exec(`
      DROP TABLE IF EXISTS activity_item_tags;
      DROP TABLE IF EXISTS activity_topic_tags;
      DROP TABLE IF EXISTS activity_tags;
      DROP TABLE IF EXISTS activity_assets;
      DROP TABLE IF EXISTS activity_item_topics;
      DROP TABLE IF EXISTS activity_items;
      DROP TABLE IF EXISTS activity_topics;

      CREATE TABLE activity_topics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        group_name TEXT NULL,
        description TEXT NULL,
        icon TEXT NULL,
        cover_path TEXT NULL,
        cover_variants TEXT NOT NULL DEFAULT '{}',
        sort_order INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE activity_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        word TEXT NOT NULL,
        description TEXT NULL,
        related_words TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE activity_item_topics (
        topic_id INTEGER NOT NULL,
        item_id INTEGER NOT NULL,
        PRIMARY KEY (topic_id, item_id),
        FOREIGN KEY (topic_id) REFERENCES activity_topics(id) ON DELETE CASCADE,
        FOREIGN KEY (item_id) REFERENCES activity_items(id) ON DELETE CASCADE
      );
      CREATE TABLE activity_assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id INTEGER NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('icon', 'card', 'illustration')),
        path TEXT NOT NULL UNIQUE,
        variants TEXT NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'reviewing', 'approved', 'rejected')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (item_id) REFERENCES activity_items(id) ON DELETE CASCADE
      );
      CREATE INDEX idx_activity_topics_order ON activity_topics(sort_order, name);
      CREATE INDEX idx_activity_items_name ON activity_items(name);
      CREATE INDEX idx_activity_item_topics_item ON activity_item_topics(item_id);
      CREATE INDEX idx_activity_assets_item ON activity_assets(item_id);
    `);

    const now = timestamp();
    const insertTopic = db.prepare(`INSERT INTO activity_topics
      (name, slug, group_name, description, icon, sort_order, status, created_at, updated_at)
      VALUES (?, ?, NULL, ?, ?, ?, 'published', ?, ?)`);
    const insertItem = db.prepare(`INSERT INTO activity_items
      (name, slug, word, description, related_words, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, '[]', 'published', ?, ?)`);
    const insertRelation = db.prepare("INSERT OR IGNORE INTO activity_item_topics (topic_id, item_id) VALUES (?, ?)");
    const itemIds = new Map<string, number>();

    ACTIVITY_ITEM_SEED.forEach((topic, index) => {
      const topicId = Number(insertTopic.run(topic.name, topic.slug, ACTIVITY_TOPIC_DESCRIPTION_ZH[topic.slug] || null, topic.icon, index + 1, now, now).lastInsertRowid);
      topic.items.forEach(([slug, name, word]) => {
        let itemId = itemIds.get(slug);
        if (!itemId) {
          itemId = Number(insertItem.run(name, slug, word, ACTIVITY_ITEM_DESCRIPTION_ZH[slug] || null, now, now).lastInsertRowid);
          itemIds.set(slug, itemId);
        }
        insertRelation.run(topicId, itemId);
      });
    });
    seedSupplement(db, now);
    createTopicTagTables(db);
    seedTopicGroups(db);
    db.prepare("INSERT OR REPLACE INTO activity_library_meta (key, value) VALUES ('schema_version', ?)").run(SCHEMA_VERSION);
  })();
}

function parseStrings(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

type BaseItemRow = Omit<ActivityItem, "related_words" | "topic_ids" | "topic_names" | "assets" | "icon"> & { related_words: string };

function parseVariants(value: string | ActivityImageVariants | null): ActivityImageVariants {
  if (!value) return {};
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as ActivityImageVariants : {};
  } catch {
    return {};
  }
}

function mapAsset(row: Omit<ActivityAsset, "item_name" | "variants"> & { item_name?: string; variants: string | ActivityImageVariants }): ActivityAsset {
  return { ...row, item_name: row.item_name || "", variants: parseVariants(row.variants) };
}

function hydrateItem(row: BaseItemRow): ActivityItem {
  const db = database();
  const topics = db.prepare(`SELECT t.id, t.name FROM activity_topics t
    JOIN activity_item_topics rel ON rel.topic_id = t.id WHERE rel.item_id = ?
    ORDER BY t.sort_order, t.name COLLATE NOCASE`).all(row.id) as Array<{ id: number; name: string }>;
  const assets = db.prepare(`SELECT a.*, i.name AS item_name FROM activity_assets a
    JOIN activity_items i ON i.id = a.item_id WHERE a.item_id = ? ORDER BY a.type, a.id DESC`).all(row.id).map((asset) => mapAsset(asset as ActivityAsset));
  return {
    ...row,
    related_words: parseStrings(row.related_words),
    topic_ids: topics.map((topic) => topic.id),
    topic_names: topics.map((topic) => topic.name),
    assets,
    icon: assets.find((asset) => asset.type === "icon" && asset.status === "approved") || assets.find((asset) => asset.type === "icon") || null,
  };
}

export function listActivityTopics(): ActivityTopic[] {
  const db = database();
  const rows = db.prepare(`SELECT t.*, tag.id AS tag_id, tag.name AS tag_name, COUNT(rel.item_id) AS item_count FROM activity_topics t
    LEFT JOIN activity_item_topics rel ON rel.topic_id = t.id
    LEFT JOIN activity_topic_tags topic_tag ON topic_tag.topic_id = t.id
    LEFT JOIN activity_tags tag ON tag.id = topic_tag.tag_id
    GROUP BY t.id ORDER BY t.sort_order, t.name COLLATE NOCASE`).all() as Array<Omit<ActivityTopic, "item_ids">>;
  const ids = db.prepare("SELECT item_id FROM activity_item_topics WHERE topic_id = ? ORDER BY item_id");
  return rows.map((row) => ({ ...row, cover_variants: parseVariants(row.cover_variants), item_ids: (ids.all(row.id) as Array<{ item_id: number }>).map((entry) => entry.item_id) }));
}

export function getActivityTopic(id: number) {
  return listActivityTopics().find((topic) => topic.id === id) || null;
}

function uniqueSlug(table: "activity_items" | "activity_topics" | "activity_tags", source: string, exceptId?: number) {
  const db = database();
  const base = slugify(source, { lower: true, strict: true }) || randomUUID();
  let slug = base;
  let suffix = 2;
  const query = db.prepare(`SELECT id FROM ${table} WHERE slug = ?${exceptId ? " AND id != ?" : ""}`);
  while (query.get(...(exceptId ? [slug, exceptId] : [slug]))) slug = `${base}-${suffix++}`;
  return slug;
}

function validIds(ids: number[] | undefined, table: "activity_items" | "activity_topics") {
  if (!ids?.length) return [];
  const query = database().prepare(`SELECT id FROM ${table} WHERE id = ?`);
  return [...new Set(ids.filter(Number.isInteger))].filter((id) => Boolean(query.get(id)));
}

function replaceTopicItems(topicId: number, itemIds: number[]) {
  const db = database();
  db.prepare("DELETE FROM activity_item_topics WHERE topic_id = ?").run(topicId);
  const insert = db.prepare("INSERT INTO activity_item_topics (topic_id, item_id) VALUES (?, ?)");
  itemIds.forEach((itemId) => insert.run(topicId, itemId));
}

function replaceTopicTag(topicId: number, tagId: number | null) {
  const db = database();
  db.prepare("DELETE FROM activity_topic_tags WHERE topic_id = ?").run(topicId);
  if (tagId && db.prepare("SELECT id FROM activity_tags WHERE id = ?").get(tagId)) {
    db.prepare("INSERT INTO activity_topic_tags (topic_id, tag_id) VALUES (?, ?)").run(topicId, tagId);
  }
}

function normalizeTopic(input: ActivityTopicInput) {
  if (!input.name?.trim()) throw new Error("主题名称不能为空。");
  const status = TOPIC_STATUSES.includes(input.status as TopicStatus) ? input.status! : "draft";
  return {
    name: input.name.trim(), description: input.description?.trim() || null,
    icon: input.icon?.trim() || null, sortOrder: Number.isInteger(input.sort_order) ? input.sort_order! : 0, status,
    itemIds: validIds(input.item_ids, "activity_items"), tagId: Number.isInteger(input.tag_id) ? input.tag_id! : null,
  };
}

export function createActivityTopic(input: ActivityTopicInput) {
  const value = normalizeTopic(input);
  const db = database();
  const now = timestamp();
  const id = db.transaction(() => {
    const result = db.prepare(`INSERT INTO activity_topics (name, slug, group_name, description, icon, sort_order, status, created_at, updated_at)
      VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`).run(value.name, uniqueSlug("activity_topics", input.slug || value.name), value.description, value.icon, value.sortOrder, value.status, now, now);
    const topicId = Number(result.lastInsertRowid);
    replaceTopicItems(topicId, value.itemIds);
    replaceTopicTag(topicId, value.tagId);
    return topicId;
  })();
  return getActivityTopic(id);
}

export function updateActivityTopic(id: number, input: ActivityTopicInput) {
  if (!getActivityTopic(id)) throw new Error("主题不存在。");
  const value = normalizeTopic(input);
  const db = database();
  db.transaction(() => {
    db.prepare(`UPDATE activity_topics SET name=?, slug=?, group_name=NULL, description=?, icon=?, sort_order=?, status=?, updated_at=? WHERE id=?`)
      .run(value.name, uniqueSlug("activity_topics", input.slug || value.name, id), value.description, value.icon, value.sortOrder, value.status, timestamp(), id);
    replaceTopicItems(id, value.itemIds);
    replaceTopicTag(id, value.tagId);
  })();
  return getActivityTopic(id);
}

export async function deleteActivityTopic(id: number) {
  const topic = getActivityTopic(id);
  database().prepare("DELETE FROM activity_topics WHERE id = ?").run(id);
  if (topic) await deleteImageVariants(topic.cover_variants);
}

export function listActivityItems(filters?: { keyword?: string; topic_id?: number; status?: ItemStatus }) {
  const conditions: string[] = [];
  const params: Array<string | number> = [];
  if (filters?.keyword?.trim()) {
    const keyword = `%${filters.keyword.trim()}%`;
    conditions.push("(i.name LIKE ? OR i.word LIKE ? OR i.description LIKE ?)");
    params.push(keyword, keyword, keyword);
  }
  if (filters?.topic_id) {
    conditions.push("EXISTS (SELECT 1 FROM activity_item_topics rel WHERE rel.item_id = i.id AND rel.topic_id = ?)");
    params.push(filters.topic_id);
  }
  if (filters?.status && ITEM_STATUSES.includes(filters.status)) {
    conditions.push("i.status = ?");
    params.push(filters.status);
  }
  const rows = database().prepare(`SELECT i.* FROM activity_items i ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""}
    ORDER BY i.name COLLATE NOCASE`).all(...params) as BaseItemRow[];
  return rows.map(hydrateItem);
}

export function getActivityItem(id: number) {
  const row = database().prepare("SELECT * FROM activity_items WHERE id = ?").get(id) as BaseItemRow | undefined;
  return row ? hydrateItem(row) : null;
}

function normalizeItem(input: ActivityItemInput) {
  if (!input.name?.trim()) throw new Error("对象名称不能为空。");
  if (!input.word?.trim()) throw new Error("核心词不能为空。");
  const status = ITEM_STATUSES.includes(input.status as ItemStatus) ? input.status! : "draft";
  return {
    name: input.name.trim(), word: input.word.trim().toUpperCase(), description: input.description?.trim() || null, status,
    relatedWords: [...new Set((input.related_words || []).map((word) => word.trim().toUpperCase()).filter(Boolean))],
    topicIds: validIds(input.topic_ids, "activity_topics"),
  };
}

function replaceItemRelations(itemId: number, topicIds: number[]) {
  const db = database();
  db.prepare("DELETE FROM activity_item_topics WHERE item_id = ?").run(itemId);
  const insertTopic = db.prepare("INSERT INTO activity_item_topics (topic_id, item_id) VALUES (?, ?)");
  topicIds.forEach((topicId) => insertTopic.run(topicId, itemId));
}

export function createActivityItem(input: ActivityItemInput) {
  const value = normalizeItem(input);
  const db = database();
  const now = timestamp();
  const id = db.transaction(() => {
    const result = db.prepare(`INSERT INTO activity_items (name, slug, word, description, related_words, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(value.name, uniqueSlug("activity_items", input.slug || value.name), value.word, value.description, JSON.stringify(value.relatedWords), value.status, now, now);
    const itemId = Number(result.lastInsertRowid);
    replaceItemRelations(itemId, value.topicIds);
    return itemId;
  })();
  return getActivityItem(id);
}

export function updateActivityItem(id: number, input: ActivityItemInput) {
  if (!getActivityItem(id)) throw new Error("对象词条不存在。");
  const value = normalizeItem(input);
  const db = database();
  db.transaction(() => {
    db.prepare("UPDATE activity_items SET name=?, slug=?, word=?, description=?, related_words=?, status=?, updated_at=? WHERE id=?")
      .run(value.name, uniqueSlug("activity_items", input.slug || value.name, id), value.word, value.description, JSON.stringify(value.relatedWords), value.status, timestamp(), id);
    replaceItemRelations(id, value.topicIds);
  })();
  return getActivityItem(id);
}

export async function deleteActivityItem(id: number) {
  const assets = listActivityAssets({ item_id: id });
  database().prepare("DELETE FROM activity_items WHERE id = ?").run(id);
  await Promise.all(assets.map(async (asset) => {
    await deleteImageVariants(asset.variants);
    if (!Object.values(asset.variants).includes(asset.path)) await deleteActivityAssetFile(asset.path);
  }));
}

export function listActivityTags(): ActivityTag[] {
  return database().prepare(`SELECT tag.*, COUNT(rel.topic_id) AS topic_count FROM activity_tags tag
    LEFT JOIN activity_topic_tags rel ON rel.tag_id = tag.id GROUP BY tag.id ORDER BY tag.sort_order, tag.name COLLATE NOCASE`).all() as ActivityTag[];
}

function normalizeTag(input: ActivityTagInput) {
  if (!input.name?.trim()) throw new Error("分组名称不能为空。");
  return { name: input.name.trim(), description: input.description?.trim() || null, sortOrder: Number.isInteger(input.sort_order) ? input.sort_order! : 0 };
}

export function createActivityTag(input: ActivityTagInput) {
  const value = normalizeTag(input);
  const result = database().prepare("INSERT INTO activity_tags (name, slug, description, sort_order) VALUES (?, ?, ?, ?)")
    .run(value.name, uniqueSlug("activity_tags", input.slug || value.name), value.description, value.sortOrder);
  return listActivityTags().find((tag) => tag.id === Number(result.lastInsertRowid))!;
}

export function updateActivityTag(id: number, input: ActivityTagInput) {
  if (!database().prepare("SELECT id FROM activity_tags WHERE id = ?").get(id)) throw new Error("Topic 分组不存在。");
  const value = normalizeTag(input);
  database().prepare("UPDATE activity_tags SET name=?, slug=?, description=?, sort_order=? WHERE id=?")
    .run(value.name, uniqueSlug("activity_tags", input.slug || value.name, id), value.description, value.sortOrder, id);
  return listActivityTags().find((tag) => tag.id === id)!;
}

export function deleteActivityTag(id: number) {
  database().prepare("DELETE FROM activity_tags WHERE id = ?").run(id);
}

export function listActivityAssets(filters?: { item_id?: number; type?: AssetType; status?: AssetStatus }) {
  const conditions: string[] = [];
  const params: Array<string | number> = [];
  if (filters?.item_id) { conditions.push("a.item_id = ?"); params.push(filters.item_id); }
  if (filters?.type && ASSET_TYPES.includes(filters.type)) { conditions.push("a.type = ?"); params.push(filters.type); }
  if (filters?.status && ASSET_STATUSES.includes(filters.status)) { conditions.push("a.status = ?"); params.push(filters.status); }
  return database().prepare(`SELECT a.*, i.name AS item_name FROM activity_assets a JOIN activity_items i ON i.id = a.item_id
    ${conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""} ORDER BY a.created_at DESC, a.id DESC`).all(...params).map((row) => mapAsset(row as ActivityAsset));
}

async function createImageVariants(file: File, prefix: string, mode: "contain" | "cover") {
  const buffer = Buffer.from(await file.arrayBuffer());
  const id = randomUUID();
  const variants: Required<ActivityImageVariants> = {
    size_128: `${prefix}-${id}-128.webp`,
    size_256: `${prefix}-${id}-256.webp`,
    size_512: `${prefix}-${id}-512.webp`,
  };
  await mkdir(ASSET_DIR, { recursive: true });
  await Promise.all(([128, 256, 512] as const).map(async (size) => {
    const image = sharp(buffer).resize(size, size, {
      fit: mode,
      position: "centre",
      withoutEnlargement: mode === "contain",
      background: mode === "contain" ? { r: 0, g: 0, b: 0, alpha: 0 } : undefined,
    });
    await image.webp({ quality: size === 512 ? 88 : 82 }).toFile(path.join(ASSET_DIR, variants[`size_${size}`]));
  }));
  return variants;
}

export async function createActivityAsset(file: File, input: ActivityAssetInput) {
  if (!getActivityItem(input.item_id)) throw new Error("对象词条不存在。");
  if (!ASSET_TYPES.includes(input.type)) throw new Error("无效的图片类型。");
  if (!file.type.startsWith("image/")) throw new Error("只支持图片文件。");
  if (file.size > 10 * 1024 * 1024) throw new Error("图片不能超过 10MB。");
  const status = ASSET_STATUSES.includes(input.status as AssetStatus) ? input.status! : "uploaded";
  const replacedIcons = input.type === "icon" ? listActivityAssets({ item_id: input.item_id, type: "icon" }) : [];
  const variants = await createImageVariants(file, input.type, "contain");
  const name = variants.size_512;
  const now = timestamp();
  const result = database().prepare(`INSERT INTO activity_assets (item_id, type, path, variants, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(input.item_id, input.type, name, JSON.stringify(variants), status, now, now);
  const asset = listActivityAssets().find((entry) => entry.id === Number(result.lastInsertRowid))!;
  await Promise.all(replacedIcons.map((previous) => deleteActivityAsset(previous.id)));
  return asset;
}

export async function saveActivityTopicCover(topicId: number, file: File) {
  const topic = getActivityTopic(topicId);
  if (!topic) throw new Error("主题不存在。");
  if (!file.type.startsWith("image/")) throw new Error("只支持图片文件。");
  if (file.size > 10 * 1024 * 1024) throw new Error("图片不能超过 10MB。");
  const variants = await createImageVariants(file, `topic-${topicId}`, "cover");
  database().prepare("UPDATE activity_topics SET cover_path = ?, cover_variants = ?, updated_at = ? WHERE id = ?")
    .run(variants.size_512, JSON.stringify(variants), timestamp(), topicId);
  await deleteImageVariants(topic.cover_variants);
  return getActivityTopic(topicId)!;
}

export async function deleteActivityTopicCover(topicId: number) {
  const topic = getActivityTopic(topicId);
  if (!topic) return;
  database().prepare("UPDATE activity_topics SET cover_path = NULL, cover_variants = '{}', updated_at = ? WHERE id = ?")
    .run(timestamp(), topicId);
  await deleteImageVariants(topic.cover_variants);
}

export function updateActivityAsset(id: number, status: AssetStatus) {
  if (!ASSET_STATUSES.includes(status)) throw new Error("无效的审核状态。");
  const result = database().prepare("UPDATE activity_assets SET status = ?, updated_at = ? WHERE id = ?").run(status, timestamp(), id);
  if (!result.changes) throw new Error("图片素材不存在。");
  return listActivityAssets().find((asset) => asset.id === id)!;
}

export async function deleteActivityAsset(id: number) {
  const asset = listActivityAssets().find((entry) => entry.id === id);
  if (!asset) return;
  database().prepare("DELETE FROM activity_assets WHERE id = ?").run(id);
  await deleteImageVariants(asset.variants);
  if (!Object.values(asset.variants).includes(asset.path)) await deleteActivityAssetFile(asset.path);
}

async function deleteImageVariants(variants: ActivityImageVariants) {
  await Promise.all([...new Set(Object.values(variants).filter((name): name is string => Boolean(name)))].map(deleteActivityAssetFile));
}

async function deleteActivityAssetFile(name: string) {
  if (path.basename(name) === name) await rm(path.join(ASSET_DIR, name), { force: true });
}

export async function readActivityAsset(name: string) {
  if (path.basename(name) !== name) throw new Error("无效的资源路径。");
  return readFile(path.join(ASSET_DIR, name));
}
