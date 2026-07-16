import { promises as fs } from "node:fs";
import path from "node:path";

import { getLocalDatabase } from "@/lib/local-admin-db";
import { PUZZLE_PAGE_CONFIGS, getPuzzlePageConfig } from "@/lib/puzzle-page-config";

export type PuzzleAssetKind = "puzzle" | "answer";

export type PuzzleAssetRecord = {
  id: number;
  page_slug: string;
  difficulty: string;
  asset_kind: PuzzleAssetKind;
  image_url: string;
  local_file_path: string;
  sort_order: number;
  created_at: string;
};

export type PuzzlePageRecord = {
  slug: string;
  family: string;
  variant: string;
  title: string;
  description: string;
  seo_title: string;
  seo_description: string;
  status: "draft" | "published";
  generated_at: string | null;
  updated_at: string;
  assets: PuzzleAssetRecord[];
};

export type PuzzleAssetDeleteQueueRecord = {
  id: number;
  page_slug: string;
  difficulty: string;
  image_url: string;
  local_file_path: string;
  created_at: string;
};

export type PuzzlePublishJobStatus = "running" | "paused" | "completed" | "failed";

export type PuzzlePublishJobRecord = {
  page_slug: string;
  status: PuzzlePublishJobStatus;
  difficulty_index: number;
  item_index: number;
  total_per_difficulty: number;
  phase: "generating" | "cleanup" | "completed";
  cleanup_current: number;
  cleanup_total: number;
  last_error: string;
  updated_at: string;
};

export type PuzzlePublishStagedAssetRecord = PuzzleAssetRecord;

export type PuzzleCategoryRecord = {
  slug: string;
  parent_slug: string | null;
  title: string;
  family: string;
  cover_image_url: string;
  cover_local_file_path: string;
  is_custom_cover: number;
  is_active: number;
  sort_order: number;
  updated_at: string;
};

const PUZZLE_CATEGORY_SEEDS = [
  { slug: "puzzles", parent: null, title: "Puzzles", family: "", cover: "imgs/puzzles/e5d23639-f323-477d-922e-48c5da0f44ef-1024.webp", sort: 0 },
  { slug: "sudoku", parent: "puzzles", title: "Sudoku", family: "sudoku", cover: "imgs/puzzles/sudoku/918223c1-906d-4202-b453-d2d34c1eaad5-1024.webp", sort: 0 },
  { slug: "mazes", parent: "puzzles", title: "Mazes", family: "mazes", cover: "imgs/puzzles/mazes/57ecee1a-81e0-49ae-a352-14c578c4d716-1024.webp", sort: 1 },
  { slug: "4x4-sudoku", parent: "sudoku", title: "4x4 Sudoku", family: "sudoku", cover: "imgs/puzzles/sudoku/4x4-sudoku/0655e416-c6a3-4c6c-a7af-705ab9a456fb-1024.webp", sort: 0 },
  { slug: "6x6-sudoku", parent: "sudoku", title: "6x6 Sudoku", family: "sudoku", cover: "imgs/puzzles/sudoku/6x6-sudoku/9d290ab0-a83f-457f-88ae-eb3d18814fd8-1024.webp", sort: 1 },
  { slug: "9x9-sudoku", parent: "sudoku", title: "9x9 Sudoku", family: "sudoku", cover: "imgs/puzzles/sudoku/9x9-sudoku/215c88f0-9390-418e-8311-8a3ff5bffca0-1024.webp", sort: 2 },
  { slug: "printable-mazes", parent: "mazes", title: "Printable Mazes", family: "mazes", cover: "imgs/puzzles/mazes/printable-mazes/013fed15-0d1d-4680-964c-0a7436f4b231-1024.webp", sort: 0 },
  { slug: "circle-mazes", parent: "mazes", title: "Circle Mazes", family: "mazes", cover: "imgs/puzzles/mazes/circle-mazes/8809d55f-f9f4-49cf-864b-9c7face7a662-1024.webp", sort: 1 },
] as const;

function ensurePuzzleTables() {
  const db = getLocalDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS puzzle_pages (
      slug TEXT PRIMARY KEY,
      family TEXT NOT NULL,
      variant TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      seo_title TEXT NOT NULL DEFAULT '',
      seo_description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      generated_at TEXT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS puzzle_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_slug TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      asset_kind TEXT NOT NULL,
      image_url TEXT NOT NULL,
      local_file_path TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (page_slug) REFERENCES puzzle_pages(slug) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_puzzle_assets_page
      ON puzzle_assets(page_slug, difficulty, asset_kind, sort_order);
    CREATE TABLE IF NOT EXISTS puzzle_asset_delete_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_slug TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      image_url TEXT NOT NULL,
      local_file_path TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_puzzle_asset_delete_queue_page
      ON puzzle_asset_delete_queue(page_slug, difficulty, id);
    CREATE TABLE IF NOT EXISTS puzzle_publish_jobs (
      page_slug TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      difficulty_index INTEGER NOT NULL DEFAULT 0,
      item_index INTEGER NOT NULL DEFAULT 0,
      total_per_difficulty INTEGER NOT NULL DEFAULT 48,
      phase TEXT NOT NULL DEFAULT 'generating',
      cleanup_current INTEGER NOT NULL DEFAULT 0,
      cleanup_total INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS puzzle_publish_staged_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_slug TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      asset_kind TEXT NOT NULL,
      image_url TEXT NOT NULL,
      local_file_path TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(page_slug, difficulty, asset_kind, sort_order)
    );
    CREATE INDEX IF NOT EXISTS idx_puzzle_publish_staged_assets_page
      ON puzzle_publish_staged_assets(page_slug, difficulty, asset_kind, sort_order);
    CREATE TABLE IF NOT EXISTS puzzle_categories (
      slug TEXT PRIMARY KEY,
      parent_slug TEXT NULL,
      title TEXT NOT NULL,
      family TEXT NOT NULL DEFAULT '',
      cover_image_url TEXT NOT NULL DEFAULT '',
      cover_local_file_path TEXT NOT NULL DEFAULT '',
      is_custom_cover INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);

  const categoryColumns = db.prepare("PRAGMA table_info(puzzle_categories)").all() as Array<{ name: string }>;
  if (!categoryColumns.some((column) => column.name === "is_active")) {
    db.exec("ALTER TABLE puzzle_categories ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1");
  }

  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO puzzle_pages
      (slug, family, variant, title, description, seo_title, seo_description, status, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)
    ON CONFLICT(slug) DO UPDATE SET
      family = excluded.family,
      variant = excluded.variant,
      title = excluded.title,
      description = excluded.description,
      seo_title = excluded.seo_title,
      seo_description = excluded.seo_description
  `);
  const seed = db.transaction(() => {
    for (const item of PUZZLE_PAGE_CONFIGS) {
      insert.run(
        item.slug,
        item.family,
        item.variant,
        item.title,
        item.description,
        item.seoTitle,
        item.seoDescription,
        now,
      );
    }
    const insertCategory = db.prepare(`
      INSERT INTO puzzle_categories
        (slug, parent_slug, title, family, cover_image_url, cover_local_file_path, is_custom_cover, sort_order, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        parent_slug = excluded.parent_slug, title = excluded.title,
        family = excluded.family, sort_order = excluded.sort_order
    `);
    for (const item of PUZZLE_CATEGORY_SEEDS) {
      insertCategory.run(item.slug, item.parent, item.title, item.family, item.cover, item.cover, item.sort, now);
    }
  });
  seed();
  return db;
}

export function listPuzzleCategories(parentSlug?: string | null) {
  const db = ensurePuzzleTables();
  if (parentSlug === undefined) {
    return db.prepare("SELECT * FROM puzzle_categories ORDER BY parent_slug, sort_order, slug").all() as PuzzleCategoryRecord[];
  }
  return db.prepare("SELECT * FROM puzzle_categories WHERE parent_slug IS ? ORDER BY sort_order, slug").all(parentSlug) as PuzzleCategoryRecord[];
}

export function getPuzzleCategory(slug: string) {
  return (ensurePuzzleTables().prepare("SELECT * FROM puzzle_categories WHERE slug = ? LIMIT 1").get(slug) as PuzzleCategoryRecord | undefined) ?? null;
}

export function updatePuzzleCategoryCover(slug: string, imageUrl: string, localFilePath: string) {
  ensurePuzzleTables().prepare(`
    UPDATE puzzle_categories
    SET cover_image_url = ?, cover_local_file_path = ?, is_custom_cover = 1, updated_at = ?
    WHERE slug = ?
  `).run(imageUrl, localFilePath, new Date().toISOString(), slug);
  return getPuzzleCategory(slug);
}

export function updatePuzzleCategoryActive(slug: string, isActive: boolean) {
  ensurePuzzleTables().prepare(`
    UPDATE puzzle_categories
    SET is_active = ?, updated_at = ?
    WHERE slug = ?
  `).run(isActive ? 1 : 0, new Date().toISOString(), slug);
  return getPuzzleCategory(slug);
}

export function getPuzzlePublishJob(slug: string): PuzzlePublishJobRecord | null {
  const job = ensurePuzzleTables()
    .prepare("SELECT * FROM puzzle_publish_jobs WHERE page_slug = ? LIMIT 1")
    .get(slug) as PuzzlePublishJobRecord | undefined;
  return job ?? null;
}

export function startOrResumePuzzlePublishJob(slug: string, totalPerDifficulty = 48) {
  const db = ensurePuzzleTables();
  const existing = getPuzzlePublishJob(slug);
  const now = new Date().toISOString();
  if (existing && existing.status !== "completed") {
    db.prepare(`UPDATE puzzle_publish_jobs SET status = 'running', last_error = '', updated_at = ? WHERE page_slug = ?`)
      .run(now, slug);
  } else {
    db.prepare("DELETE FROM puzzle_publish_staged_assets WHERE page_slug = ?").run(slug);
    db.prepare(`
      INSERT INTO puzzle_publish_jobs
        (page_slug, status, difficulty_index, item_index, total_per_difficulty, phase, cleanup_current, cleanup_total, last_error, updated_at)
      VALUES (?, 'running', 0, 0, ?, 'generating', 0, 0, '', ?)
      ON CONFLICT(page_slug) DO UPDATE SET
        status = 'running', difficulty_index = 0, item_index = 0,
        total_per_difficulty = excluded.total_per_difficulty, phase = 'generating',
        cleanup_current = 0, cleanup_total = 0, last_error = '', updated_at = excluded.updated_at
    `).run(slug, totalPerDifficulty, now);
  }
  return getPuzzlePublishJob(slug)!;
}

export function updatePuzzlePublishJob(
  slug: string,
  changes: Partial<Pick<PuzzlePublishJobRecord, "status" | "difficulty_index" | "item_index" | "phase" | "cleanup_current" | "cleanup_total" | "last_error">>,
) {
  const entries = Object.entries(changes);
  if (entries.length === 0) return getPuzzlePublishJob(slug);
  const columns = entries.map(([key]) => `${key} = ?`).join(", ");
  ensurePuzzleTables().prepare(`UPDATE puzzle_publish_jobs SET ${columns}, updated_at = ? WHERE page_slug = ?`)
    .run(...entries.map(([, value]) => value), new Date().toISOString(), slug);
  return getPuzzlePublishJob(slug);
}

export function getStagedPuzzlePublishItem(slug: string, difficulty: string, sortOrder: number) {
  return ensurePuzzleTables().prepare(`
    SELECT * FROM puzzle_publish_staged_assets
    WHERE page_slug = ? AND difficulty = ? AND sort_order = ?
    ORDER BY asset_kind
  `).all(slug, difficulty, sortOrder) as PuzzlePublishStagedAssetRecord[];
}

export function addStagedPuzzlePublishAssets(input: {
  slug: string;
  difficulty: string;
  assets: Array<Omit<PuzzleAssetRecord, "id" | "page_slug" | "difficulty" | "created_at">>;
}) {
  const db = ensurePuzzleTables();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO puzzle_publish_staged_assets
      (page_slug, difficulty, asset_kind, image_url, local_file_path, sort_order, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const now = new Date().toISOString();
  db.transaction(() => {
    for (const asset of input.assets) {
      insert.run(input.slug, input.difficulty, asset.asset_kind, asset.image_url, asset.local_file_path, asset.sort_order, now);
    }
  })();
}

export function listStagedPuzzlePublishAssets(slug: string, difficulty: string) {
  return ensurePuzzleTables().prepare(`
    SELECT * FROM puzzle_publish_staged_assets
    WHERE page_slug = ? AND difficulty = ?
    ORDER BY asset_kind, sort_order
  `).all(slug, difficulty) as PuzzlePublishStagedAssetRecord[];
}

export function clearStagedPuzzlePublishAssets(slug: string, difficulty: string) {
  ensurePuzzleTables().prepare("DELETE FROM puzzle_publish_staged_assets WHERE page_slug = ? AND difficulty = ?")
    .run(slug, difficulty);
}

export function clearStagedPuzzlePublishItem(slug: string, difficulty: string, sortOrder: number) {
  ensurePuzzleTables().prepare(`
    DELETE FROM puzzle_publish_staged_assets
    WHERE page_slug = ? AND difficulty = ? AND sort_order = ?
  `).run(slug, difficulty, sortOrder);
}

export function getPuzzlePage(slug: string): PuzzlePageRecord | null {
  if (!getPuzzlePageConfig(slug)) return null;
  const db = ensurePuzzleTables();
  const page = db.prepare("SELECT * FROM puzzle_pages WHERE slug = ? LIMIT 1").get(slug) as Omit<PuzzlePageRecord, "assets"> | undefined;
  if (!page) return null;
  const assets = db.prepare(`
    SELECT * FROM puzzle_assets
    WHERE page_slug = ?
    ORDER BY difficulty, asset_kind, sort_order, id
  `).all(slug) as PuzzleAssetRecord[];
  return { ...page, assets };
}

export function listPuzzlePages(): PuzzlePageRecord[] {
  ensurePuzzleTables();
  return PUZZLE_PAGE_CONFIGS
    .map((item) => getPuzzlePage(item.slug))
    .filter((item): item is PuzzlePageRecord => item !== null);
}

export function replacePuzzleAssets(input: {
  slug: string;
  difficulty: string;
  assets: Array<Omit<PuzzleAssetRecord, "id" | "page_slug" | "difficulty" | "created_at">>;
}) {
  const db = ensurePuzzleTables();
  const now = new Date().toISOString();
  const replace = db.transaction(() => {
    db.prepare(`
      INSERT INTO puzzle_asset_delete_queue
        (page_slug, difficulty, image_url, local_file_path, created_at)
      SELECT page_slug, difficulty, image_url, local_file_path, ?
      FROM puzzle_assets
      WHERE page_slug = ? AND difficulty = ?
    `).run(now, input.slug, input.difficulty);
    db.prepare("DELETE FROM puzzle_assets WHERE page_slug = ? AND difficulty = ?")
      .run(input.slug, input.difficulty);
    const insert = db.prepare(`
      INSERT INTO puzzle_assets
        (page_slug, difficulty, asset_kind, image_url, local_file_path, sort_order, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const asset of input.assets) {
      insert.run(
        input.slug,
        input.difficulty,
        asset.asset_kind,
        asset.image_url,
        asset.local_file_path,
        asset.sort_order,
        now,
      );
    }
    db.prepare(`
      UPDATE puzzle_pages
      SET status = 'published', generated_at = ?, updated_at = ?
      WHERE slug = ?
    `).run(now, now, input.slug);
  });
  replace();
  return getPuzzlePage(input.slug);
}

export function listQueuedPuzzleAssetDeletes(slug: string, difficulty: string) {
  const db = ensurePuzzleTables();
  return db.prepare(`
    SELECT * FROM puzzle_asset_delete_queue
    WHERE page_slug = ? AND difficulty = ?
    ORDER BY id
  `).all(slug, difficulty) as PuzzleAssetDeleteQueueRecord[];
}

export function completeQueuedPuzzleAssetDelete(id: number) {
  ensurePuzzleTables().prepare("DELETE FROM puzzle_asset_delete_queue WHERE id = ?").run(id);
}

export async function writePuzzleFrontendSnapshot() {
  const target = process.env.PRINTLY_FRONTEND_PUZZLE_DATA_PATH?.trim()
    ? path.resolve(process.env.PRINTLY_FRONTEND_PUZZLE_DATA_PATH.trim())
    : path.resolve(process.cwd(), "../site-legacy/data/puzzle-pages.json");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify({ version: 2, categories: listPuzzleCategories(), pages: listPuzzlePages() }, null, 2)}\n`, "utf8");
  return target;
}
