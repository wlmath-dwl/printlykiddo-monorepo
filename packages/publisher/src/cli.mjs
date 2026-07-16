#!/usr/bin/env node

import { DatabaseSync } from "node:sqlite";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { DependencyCollector, withCommonPageDependencies } from "../../page-data/src/index.mjs";
import { classifySiteSource } from "../../page-templates/src/index.mjs";
import { hashFile, hashValue, sha256 } from "../../shared/src/hash.mjs";
import { normalizePublicPath, pageKeyToLocalPath, publicPathToPageKey } from "../../shared/src/paths.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const ADMIN_DB = path.join(ROOT, "apps/admin/data/local-admin.sqlite");
const SITE_ROOT = path.join(ROOT, "apps/site-legacy");
const LOCAL_ROOT = path.join(ROOT, ".local");
const REGISTRY_PATH = path.join(LOCAL_ROOT, "publisher.sqlite");
const BUILD_ROOT = path.join(LOCAL_ROOT, "build");
const LOCAL_R2_ROOT = path.join(LOCAL_ROOT, "r2");

function now() {
  return new Date().toISOString();
}

function option(name, fallback = null) {
  const direct = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function openRegistry() {
  const db = new DatabaseSync(REGISTRY_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS site_urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      r2_key TEXT NOT NULL UNIQUE,
      page_type TEXT NOT NULL,
      entity_key TEXT,
      status TEXT NOT NULL DEFAULT 'dirty',
      source_hash TEXT NOT NULL,
      built_hash TEXT,
      published_hash TEXT,
      dirty_reason TEXT,
      payload_json TEXT NOT NULL,
      scan_token TEXT,
      last_error TEXT,
      built_at TEXT,
      published_at TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_site_urls_status ON site_urls(status);
    CREATE INDEX IF NOT EXISTS idx_site_urls_type ON site_urls(page_type);
    CREATE TABLE IF NOT EXISTS site_url_dependencies (
      url_id INTEGER NOT NULL,
      dependency_key TEXT NOT NULL,
      PRIMARY KEY (url_id, dependency_key),
      FOREIGN KEY (url_id) REFERENCES site_urls(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_url_dependencies_key ON site_url_dependencies(dependency_key);
    CREATE TABLE IF NOT EXISTS dependency_state (
      dependency_key TEXT PRIMARY KEY,
      content_hash TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS code_files (
      file_path TEXT PRIMARY KEY,
      content_hash TEXT NOT NULL,
      impact_kind TEXT NOT NULL,
      impact_key TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS site_artifacts (
      artifact_key TEXT PRIMARY KEY,
      content_hash TEXT NOT NULL,
      published_hash TEXT,
      status TEXT NOT NULL,
      dirty_reason TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS site_url_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL,
      content_hash TEXT NOT NULL,
      local_path TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(url_id, content_hash),
      FOREIGN KEY (url_id) REFERENCES site_urls(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS site_redirects (
      source_url TEXT PRIMARY KEY,
      destination_url TEXT NOT NULL,
      status_code INTEGER NOT NULL DEFAULT 301,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS site_publish_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation TEXT NOT NULL,
      status TEXT NOT NULL,
      total_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failure_count INTEGER NOT NULL DEFAULT 0,
      details_json TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
  `);
  return db;
}

function all(db, sql, ...params) {
  return db.prepare(sql).all(...params);
}

function get(db, sql, ...params) {
  return db.prepare(sql).get(...params);
}

function commonDependencies(family) {
  return withCommonPageDependencies(new DependencyCollector(), family);
}

function candidate(url, pageType, entityKey, payload, dependencies = []) {
  const normalized = normalizePublicPath(url);
  return {
    url: normalized,
    r2Key: publicPathToPageKey(normalized),
    pageType,
    entityKey,
    payload,
    sourceHash: hashValue(payload),
    dependencies: [...new Set(dependencies)].sort(),
  };
}

function tableExists(db, table) {
  return Boolean(get(db, "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1", table));
}

function activeRows(db, table) {
  if (!tableExists(db, table)) return [];
  const columns = new Set(all(db, `PRAGMA table_info(${table})`).map((row) => row.name));
  const filters = [];
  if (columns.has("deleted_at")) filters.push("deleted_at IS NULL");
  if (columns.has("is_active")) filters.push("is_active = 1");
  return all(db, `SELECT * FROM ${table}${filters.length ? ` WHERE ${filters.join(" AND ")}` : ""}`);
}

function buildCategoryInventory(contentDb, dependencyHashes) {
  const categories = activeRows(contentDb, "categories");
  const byId = new Map(categories.map((row) => [Number(row.id), row]));
  const pathCache = new Map();
  const pathFor = (row, seen = new Set()) => {
    const id = Number(row.id);
    if (pathCache.has(id)) return pathCache.get(id);
    if (seen.has(id)) throw new Error(`Category cycle detected at #${id}`);
    seen.add(id);
    const parent = row.parent_id == null ? null : byId.get(Number(row.parent_id));
    const value = parent ? `${pathFor(parent, seen)}/${row.slug}` : `/${row.slug}`;
    const normalized = normalizePublicPath(value);
    pathCache.set(id, normalized);
    return normalized;
  };

  const children = new Map();
  for (const row of categories) {
    const parentId = row.parent_id == null ? null : Number(row.parent_id);
    const list = children.get(parentId) ?? [];
    list.push(row);
    children.set(parentId, list);
    dependencyHashes.set(`entity:category:${row.id}`, hashValue(row));
  }

  const actives = activeRows(contentDb, "actives");
  for (const row of actives) dependencyHashes.set(`entity:active:${row.id}`, hashValue(row));

  const imgs = activeRows(contentDb, "imgs");
  for (const row of imgs) dependencyHashes.set(`entity:image:${row.id}`, hashValue(row));
  const imagesByCategory = new Map();
  for (const image of imgs) {
    const categoryId = Number(image.category_id);
    const list = imagesByCategory.get(categoryId) ?? [];
    list.push(image);
    imagesByCategory.set(categoryId, list);
  }

  const candidates = [];
  for (const row of categories) {
    const collector = commonDependencies("category");
    let cursor = row;
    while (cursor) {
      collector.entity("category", cursor.id);
      cursor = cursor.parent_id == null ? null : byId.get(Number(cursor.parent_id));
    }
    for (const child of children.get(Number(row.id)) ?? []) collector.entity("category", child.id);
    for (const image of imagesByCategory.get(Number(row.id)) ?? []) {
      collector.entity("image", image.id);
      collector.entity("active", image.active_id);
    }
    candidates.push(candidate(pathFor(row), "category", `category:${row.id}`, row, collector.values()));
  }

  const firstLevel = categories.filter((row) => row.parent_id == null).map((row) => ({ id: row.id, slug: row.slug, name: row.name, updated_at: row.updated_at }));
  dependencyHashes.set("dataset:site-navigation", hashValue(firstLevel));
  return { candidates, categories, pathFor };
}

function buildToolInventory(contentDb, dependencyHashes) {
  const candidates = [];
  const tools = activeRows(contentDb, "tool_pages");
  dependencyHashes.set("dataset:tool-list", hashValue(tools));
  for (const tool of tools) {
    const family = tool.slug === "word-search-generator" ? "word-search-root" : tool.slug === "maze-generator" ? "maze-root" : tool.slug === "sudoku-generator" ? "sudoku-root" : "static-info";
    const collector = commonDependencies(family);
    collector.dataset("tool-list");
    if (tool.slug === "word-search-generator") {
      collector.dataset("word-search-theme-list");
      collector.dataset("word-search-library");
    }
    candidates.push(candidate(tool.page_path, family, `tool:${tool.slug}`, tool, collector.values()));
  }

  if (!tableExists(contentDb, "activity_topics") || !tableExists(contentDb, "activity_items")) return candidates;
  const topics = all(contentDb, `
    SELECT t.id, t.slug, t.name, t.description, t.sort_order, t.updated_at,
           COALESCE(tag.slug, 'more-topics') AS tag_slug,
           COALESCE(tag.name, 'More Topics') AS tag_name
    FROM activity_topics t
    LEFT JOIN activity_topic_tags rel ON rel.topic_id = t.id
    LEFT JOIN activity_tags tag ON tag.id = rel.tag_id
    WHERE t.status = 'published'
    ORDER BY COALESCE(tag.sort_order, 2147483647), t.sort_order, t.name COLLATE NOCASE
  `);
  const items = all(contentDb, `
    SELECT rel.topic_id, item.id, item.word, item.related_words, item.updated_at
    FROM activity_item_topics rel
    JOIN activity_items item ON item.id = rel.item_id
    JOIN activity_topics topic ON topic.id = rel.topic_id
    WHERE item.status = 'published' AND topic.status = 'published'
    ORDER BY item.name COLLATE NOCASE
  `);
  const byTopic = new Map();
  for (const item of items) {
    const list = byTopic.get(Number(item.topic_id)) ?? [];
    list.push(item);
    byTopic.set(Number(item.topic_id), list);
  }
  const publishedThemes = [];
  for (const topic of topics) {
    const topicItems = byTopic.get(Number(topic.id)) ?? [];
    if (!topicItems.length) continue;
    const payload = { ...topic, items: topicItems };
    const key = `entity:word-search-theme:${topic.slug}`;
    dependencyHashes.set(key, hashValue(payload));
    publishedThemes.push(payload);
    const collector = commonDependencies("word-search-theme");
    collector.add(key);
    // Current legacy page embeds the complete library. This dependency will be removed
    // after the library is extracted to an independently published R2 JSON object.
    collector.dataset("word-search-library");
    collector.dataset("word-search-theme-list");
    candidates.push(candidate(
      `/tools/word-search-generator/${topic.slug}`,
      "word-search-theme",
      `word-search-theme:${topic.slug}`,
      payload,
      collector.values(),
    ));
  }
  dependencyHashes.set("dataset:word-search-theme-list", hashValue(publishedThemes.map(({ items: _items, ...topic }) => topic)));
  dependencyHashes.set("dataset:word-search-library", hashValue(publishedThemes));
  return candidates;
}

async function buildPuzzleInventory(dependencyHashes) {
  const file = path.join(SITE_ROOT, "data/puzzle-pages.json");
  let snapshot;
  try {
    snapshot = JSON.parse(await readFile(file, "utf8"));
  } catch {
    return [];
  }
  dependencyHashes.set("dataset:puzzle-pages", hashValue(snapshot));
  const collector = commonDependencies("puzzle");
  collector.dataset("puzzle-pages");
  const candidates = [];
  const categories = snapshot.categories ?? [];
  const bySlug = new Map(categories.map((row) => [row.slug, row]));
  const pathFor = (row) => {
    if (row.slug === "puzzles") return "/puzzles";
    if (row.parent_slug === "puzzles") return `/puzzles/${row.slug}`;
    const parent = bySlug.get(row.parent_slug);
    return parent ? `/puzzles/${parent.slug}/${row.slug}` : `/puzzles/${row.slug}`;
  };
  for (const row of categories.filter((item) => item.is_active !== 0)) {
    candidates.push(candidate(pathFor(row), "puzzle", `puzzle-category:${row.slug}`, row, collector.values()));
  }
  return candidates;
}

function buildFixedInventory(contentDb, dependencyHashes) {
  const fixed = [
    ["/", "homepage"], ["/about", "static-info"], ["/create", "static-info"],
    ["/for-parents", "static-info"], ["/for-teachers", "static-info"],
    ["/how-to-print", "static-info"], ["/privacy", "static-info"],
    ["/terms", "static-info"], ["/collections", "collections"],
    ["/download-history", "static-info"],
  ];
  const homepage = tableExists(contentDb, "homepage_config") ? all(contentDb, "SELECT * FROM homepage_config ORDER BY id").at(0) ?? {} : {};
  dependencyHashes.set("dataset:homepage-config", hashValue(homepage));
  return fixed.map(([url, family]) => {
    const collector = commonDependencies(family);
    if (url === "/") collector.dataset("homepage-config");
    return candidate(url, family, `fixed:${url}`, { url, homepage: url === "/" ? homepage : undefined }, collector.values());
  });
}

async function walkFiles(root, relative = "") {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (["node_modules", ".next", ".open-next", ".git", "output"].includes(entry.name)) continue;
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(root, next));
    else files.push(next);
  }
  return files;
}

async function collectCodeChanges(registry) {
  const roots = ["app", "components", "lib"];
  const files = [];
  for (const root of roots) files.push(...await walkFiles(SITE_ROOT, root));
  for (const config of ["tailwind.config.js", "postcss.config.js", "next.config.js"]) {
    try { if ((await stat(path.join(SITE_ROOT, config))).isFile()) files.push(config); } catch { /* optional */ }
  }

  const changedDependencies = new Set();
  let globalReason = null;
  let changedFiles = 0;
  for (const relative of files.sort()) {
    const impact = classifySiteSource(relative);
    if (!impact) continue;
    const contentHash = await hashFile(path.join(SITE_ROOT, relative));
    const previous = get(registry, "SELECT * FROM code_files WHERE file_path = ?", relative);
    if (!previous || previous.content_hash !== contentHash || previous.impact_key !== impact.key) {
      changedFiles += 1;
      if (impact.kind === "dependency") changedDependencies.add(impact.key);
      if (impact.kind === "global") globalReason = `unclassified/global code changed: ${relative}`;
      if (impact.kind === "artifact") {
        for (const dependency of impact.dependencies ?? []) changedDependencies.add(dependency);
        registry.prepare(`
          INSERT INTO site_artifacts (artifact_key, content_hash, published_hash, status, dirty_reason, updated_at)
          VALUES (?, ?, NULL, 'dirty', ?, ?)
          ON CONFLICT(artifact_key) DO UPDATE SET
            content_hash = excluded.content_hash,
            status = CASE WHEN site_artifacts.content_hash = excluded.content_hash THEN site_artifacts.status ELSE 'dirty' END,
            dirty_reason = CASE WHEN site_artifacts.content_hash = excluded.content_hash THEN site_artifacts.dirty_reason ELSE excluded.dirty_reason END,
            updated_at = excluded.updated_at
        `).run(impact.key, contentHash, `source changed: ${relative}`, now());
      }
    }
    registry.prepare(`
      INSERT INTO code_files (file_path, content_hash, impact_kind, impact_key, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(file_path) DO UPDATE SET content_hash=excluded.content_hash, impact_kind=excluded.impact_kind,
        impact_key=excluded.impact_key, updated_at=excluded.updated_at
    `).run(relative, contentHash, impact.kind, impact.key, now());
  }
  return { changedDependencies, globalReason, changedFiles };
}

function updateDependencyStates(registry, hashes) {
  const changed = new Set();
  for (const [key, contentHash] of hashes) {
    const previous = get(registry, "SELECT content_hash FROM dependency_state WHERE dependency_key = ?", key);
    if (!previous || previous.content_hash !== contentHash) changed.add(key);
    registry.prepare(`
      INSERT INTO dependency_state (dependency_key, content_hash, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(dependency_key) DO UPDATE SET content_hash=excluded.content_hash, updated_at=excluded.updated_at
    `).run(key, contentHash, now());
  }
  return changed;
}

function upsertCandidates(registry, candidates, scanToken) {
  let created = 0;
  let contentChanged = 0;
  const replaceDependencies = (row, urlId) => {
    registry.prepare("DELETE FROM site_url_dependencies WHERE url_id = ?").run(urlId);
    const insert = registry.prepare("INSERT OR IGNORE INTO site_url_dependencies (url_id, dependency_key) VALUES (?, ?)");
    for (const dependency of row.dependencies) insert.run(urlId, dependency);
  };

  for (const row of candidates) {
    const existing = get(registry, "SELECT id, source_hash, status FROM site_urls WHERE url = ?", row.url);
    const changed = existing && existing.source_hash !== row.sourceHash;
    const restored = existing && ["deleted", "removed"].includes(existing.status);
    const status = !existing || changed || restored ? "dirty" : existing.status;
    const reason = !existing ? "new URL" : restored ? "URL restored to local content inventory" : changed ? "page source data changed" : null;
    registry.prepare(`
      INSERT INTO site_urls
        (url, r2_key, page_type, entity_key, status, source_hash, dirty_reason, payload_json, scan_token, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET
        r2_key=excluded.r2_key, page_type=excluded.page_type, entity_key=excluded.entity_key,
        status=CASE WHEN site_urls.source_hash != excluded.source_hash OR site_urls.status IN ('deleted','removed') THEN 'dirty' ELSE site_urls.status END,
        source_hash=excluded.source_hash,
        dirty_reason=CASE WHEN site_urls.source_hash != excluded.source_hash OR site_urls.status IN ('deleted','removed') THEN excluded.dirty_reason ELSE site_urls.dirty_reason END,
        payload_json=excluded.payload_json, scan_token=excluded.scan_token, updated_at=excluded.updated_at
    `).run(row.url, row.r2Key, row.pageType, row.entityKey, status, row.sourceHash, reason, JSON.stringify(row.payload), scanToken, now());
    const stored = get(registry, "SELECT id FROM site_urls WHERE url = ?", row.url);
    replaceDependencies(row, stored.id);
    if (!existing) created += 1;
    if (changed) contentChanged += 1;
  }

  const removed = registry.prepare(`
    UPDATE site_urls SET status='deleted', dirty_reason='URL no longer exists in local content inventory', updated_at=?
    WHERE (scan_token IS NULL OR scan_token != ?) AND status != 'removed'
  `).run(now(), scanToken).changes;
  return { created, contentChanged, removed };
}

function markByDependencies(registry, changedDependencies) {
  let affected = 0;
  const update = registry.prepare(`
    UPDATE site_urls SET status='dirty', dirty_reason=?, updated_at=?
    WHERE id IN (SELECT url_id FROM site_url_dependencies WHERE dependency_key = ?)
      AND status != 'deleted'
  `);
  for (const key of changedDependencies) {
    affected += update.run(`dependency changed: ${key}`, now(), key).changes;
  }
  return affected;
}

async function scan() {
  await mkdir(LOCAL_ROOT, { recursive: true });
  const registry = openRegistry();
  const contentDb = new DatabaseSync(ADMIN_DB, { readOnly: true });
  try {
    const dependencyHashes = new Map();
    const category = buildCategoryInventory(contentDb, dependencyHashes);
    const discoveredCandidates = [
      ...buildFixedInventory(contentDb, dependencyHashes),
      ...category.candidates,
      ...buildToolInventory(contentDb, dependencyHashes),
      ...await buildPuzzleInventory(dependencyHashes),
    ];
    // Later, more specific sources (for example the puzzle snapshot) win when a
    // legacy database category resolves to the same public URL.
    const candidates = [...new Map(discoveredCandidates.map((row) => [row.url, row])).values()];
    const scanToken = crypto.randomUUID();
    const upsert = upsertCandidates(registry, candidates, scanToken);
    const dataChanges = updateDependencyStates(registry, dependencyHashes);
    const codeChanges = await collectCodeChanges(registry);
    for (const key of codeChanges.changedDependencies) dataChanges.add(key);
    let dependencyAffected = markByDependencies(registry, dataChanges);
    if (codeChanges.globalReason) {
      dependencyAffected += registry.prepare(
        "UPDATE site_urls SET status='dirty', dirty_reason=?, updated_at=? WHERE status != 'deleted'",
      ).run(codeChanges.globalReason, now()).changes;
    }
    console.log(JSON.stringify({
      ok: true,
      mode: "local-only",
      registry: REGISTRY_PATH,
      scanned_urls: candidates.length,
      created: upsert.created,
      content_changed: upsert.contentChanged,
      removed: upsert.removed,
      changed_dependencies: dataChanges.size,
      dependency_affected_updates: dependencyAffected,
      changed_code_files: codeChanges.changedFiles,
      global_code_fallback: codeChanges.globalReason,
    }, null, 2));
  } finally {
    contentDb.close();
    registry.close();
  }
}

function assertLocalOrigin(raw) {
  const url = new URL(raw);
  if (!["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
    throw new Error(`Refusing non-local renderer origin: ${url.origin}`);
  }
  return url.origin;
}

async function build() {
  const origin = assertLocalOrigin(option("origin", "http://localhost:3000"));
  const limit = Number(option("limit", "0")) || Number.MAX_SAFE_INTEGER;
  const quiet = process.argv.includes("--quiet");
  await mkdir(BUILD_ROOT, { recursive: true });
  const registry = openRegistry();
  const rows = all(registry, `
    SELECT * FROM site_urls WHERE status IN ('dirty', 'failed') ORDER BY page_type, url LIMIT ?
  `, limit);
  const jobId = registry.prepare(
    "INSERT INTO site_publish_jobs (operation,status,total_count,created_at) VALUES ('build','running',?,?)",
  ).run(rows.length, now()).lastInsertRowid;
  let success = 0;
  let failure = 0;
  for (const row of rows) {
    try {
      const response = await fetch(`${origin}${row.url}`, {
        headers: { Accept: "text/html", "X-Printly-Local-Publisher": "1" },
        redirect: "manual",
      });
      if (response.status >= 300 && response.status < 400) {
        throw new Error(`renderer returned ${response.status} redirect to ${response.headers.get("location") || "an unknown location"}`);
      }
      if (!response.ok) throw new Error(`renderer returned ${response.status} ${response.statusText}`);
      const html = await response.text();
      if (!/<html[\s>]/i.test(html) || html.length < 200) throw new Error("renderer did not return a complete HTML document");
      const contentHash = sha256(html);
      if (row.published_hash === contentHash) {
        registry.prepare("UPDATE site_urls SET status='published', built_hash=?, dirty_reason=NULL, last_error=NULL, built_at=?, updated_at=? WHERE id=?")
          .run(contentHash, now(), now(), row.id);
        success += 1;
        continue;
      }
      const target = pageKeyToLocalPath(BUILD_ROOT, row.r2_key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, html, "utf8");
      const versionPath = path.join(LOCAL_ROOT, "versions", String(row.id), `${contentHash}.html`);
      await mkdir(path.dirname(versionPath), { recursive: true });
      await writeFile(versionPath, html, "utf8");
      registry.prepare(`
        INSERT OR IGNORE INTO site_url_versions (url_id,content_hash,local_path,created_at) VALUES (?,?,?,?)
      `).run(row.id, contentHash, versionPath, now());
      registry.prepare("UPDATE site_urls SET status='built', built_hash=?, dirty_reason=NULL, last_error=NULL, built_at=?, updated_at=? WHERE id=?")
        .run(contentHash, now(), now(), row.id);
      success += 1;
      if (!quiet) console.log(`BUILT ${row.url} -> ${row.r2_key}`);
    } catch (error) {
      failure += 1;
      const message = error instanceof Error ? error.message : String(error);
      registry.prepare("UPDATE site_urls SET status='failed', last_error=?, updated_at=? WHERE id=?").run(message, now(), row.id);
      console.error(`FAILED ${row.url}: ${message}`);
    }
  }
  registry.prepare("UPDATE site_publish_jobs SET status=?,success_count=?,failure_count=?,completed_at=? WHERE id=?")
    .run(failure ? "failed" : "completed", success, failure, now(), jobId);
  registry.close();
  console.log(JSON.stringify({ ok: failure === 0, mode: "local-only", origin, total: rows.length, success, failure }, null, 2));
  if (failure) process.exitCode = 1;
}

async function copyIfPresent(source, destination) {
  try {
    await stat(source);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}

async function publishLocal() {
  const registry = openRegistry();
  await mkdir(LOCAL_R2_ROOT, { recursive: true });
  const rows = all(registry, "SELECT * FROM site_urls WHERE status = 'built' ORDER BY url");
  const deletedRows = all(registry, "SELECT * FROM site_urls WHERE status = 'deleted' ORDER BY url");
  const batchInvalidatedUrls = [...rows, ...deletedRows].map((row) => row.url);
  let success = 0;
  for (const row of rows) {
    const source = pageKeyToLocalPath(BUILD_ROOT, row.r2_key);
    const destination = pageKeyToLocalPath(LOCAL_R2_ROOT, row.r2_key);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(source, destination, { force: true });
    registry.prepare("UPDATE site_urls SET status='published',published_hash=built_hash,published_at=?,updated_at=? WHERE id=?")
      .run(now(), now(), row.id);
    success += 1;
  }
  for (const row of deletedRows) {
    await rm(pageKeyToLocalPath(BUILD_ROOT, row.r2_key), { force: true });
    await rm(pageKeyToLocalPath(LOCAL_R2_ROOT, row.r2_key), { force: true });
    registry.prepare("UPDATE site_urls SET status='removed',updated_at=? WHERE id=?").run(now(), row.id);
  }
  await copyIfPresent(path.join(SITE_ROOT, "public"), LOCAL_R2_ROOT);
  await copyIfPresent(path.join(SITE_ROOT, ".next/static"), path.join(LOCAL_R2_ROOT, "_next/static"));
  registry.prepare(`
    UPDATE site_artifacts SET status='published',published_hash=content_hash,dirty_reason=NULL,updated_at=?
    WHERE status='dirty'
  `).run(now());
  const manifest = all(registry, "SELECT url,r2_key,page_type,published_hash,published_at FROM site_urls WHERE status='published' ORDER BY url");
  await mkdir(path.join(LOCAL_R2_ROOT, "data"), { recursive: true });
  await writeFile(path.join(LOCAL_R2_ROOT, "data/url-manifest.json"), `${JSON.stringify({ generated_at: now(), urls: manifest }, null, 2)}\n`);
  const invalidationPath = path.join(LOCAL_R2_ROOT, "data/cache-invalidation.json");
  let priorInvalidationUrls = [];
  try {
    const prior = JSON.parse(await readFile(invalidationPath, "utf8"));
    priorInvalidationUrls = Array.isArray(prior.urls) ? prior.urls : [];
  } catch { /* first local publish */ }
  const invalidatedUrls = [...new Set([...priorInvalidationUrls, ...batchInvalidatedUrls])].sort();
  await writeFile(invalidationPath, `${JSON.stringify({
    generated_at: now(),
    mode: "local-only",
    urls: invalidatedUrls,
    note: "A future remote publisher must purge these exact public URLs only after every corresponding R2 upload succeeds.",
  }, null, 2)}\n`);
  registry.close();
  console.log(JSON.stringify({
    ok: true,
    mode: "local-only",
    published: success,
    deleted_local_pages: deletedRows.length,
    cache_invalidation_urls: invalidatedUrls.length,
    cache_invalidation_urls_added: batchInvalidatedUrls.length,
    local_r2: LOCAL_R2_ROOT,
  }, null, 2));
}

function status() {
  const registry = openRegistry();
  const byStatus = all(registry, "SELECT status, COUNT(*) AS count FROM site_urls WHERE status != 'removed' GROUP BY status ORDER BY status");
  const byType = all(registry, "SELECT page_type, COUNT(*) AS count FROM site_urls WHERE status != 'removed' GROUP BY page_type ORDER BY page_type");
  const removedHistory = get(registry, "SELECT COUNT(*) AS count FROM site_urls WHERE status = 'removed'").count;
  const artifacts = all(registry, "SELECT * FROM site_artifacts ORDER BY artifact_key");
  const failures = all(registry, "SELECT url,last_error FROM site_urls WHERE status='failed' ORDER BY url LIMIT 20");
  registry.close();
  console.log(JSON.stringify({ mode: "local-only", registry: REGISTRY_PATH, by_status: byStatus, by_type: byType, removed_history: removedHistory, artifacts, failures }, null, 2));
}

function rebuild() {
  const registry = openRegistry();
  const scope = option("scope", "all");
  let result;
  if (scope === "all") {
    result = registry.prepare("UPDATE site_urls SET status='dirty',dirty_reason='manual full rebuild',updated_at=? WHERE status!='deleted'").run(now());
  } else if (scope.startsWith("type:")) {
    const type = scope.slice(5);
    result = registry.prepare("UPDATE site_urls SET status='dirty',dirty_reason=?,updated_at=? WHERE page_type=? AND status!='deleted'")
      .run(`manual page-family rebuild: ${type}`, now(), type);
  } else if (scope.startsWith("dependency:")) {
    const dependency = scope.slice("dependency:".length);
    result = registry.prepare(`
      UPDATE site_urls SET status='dirty',dirty_reason=?,updated_at=?
      WHERE id IN (SELECT url_id FROM site_url_dependencies WHERE dependency_key=?) AND status!='deleted'
    `).run(`manual dependency rebuild: ${dependency}`, now(), dependency);
  } else {
    const url = normalizePublicPath(scope.startsWith("url:") ? scope.slice(4) : scope);
    result = registry.prepare("UPDATE site_urls SET status='dirty',dirty_reason='manual URL rebuild',updated_at=? WHERE url=? AND status!='deleted'").run(now(), url);
  }
  registry.close();
  console.log(JSON.stringify({ ok: true, mode: "local-only", scope, marked_dirty: result.changes }, null, 2));
}

const command = process.argv[2] ?? "status";
const commands = { scan, build, "publish-local": publishLocal, status, rebuild };
if (!commands[command]) {
  console.error(`Unknown command: ${command}. Expected one of ${Object.keys(commands).join(", ")}`);
  process.exit(1);
}

await commands[command]();
