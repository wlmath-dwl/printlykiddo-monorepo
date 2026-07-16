import { promises as fs } from "node:fs";
import path from "node:path";

import { getLocalDatabase } from "@/lib/local-admin-db";

export type ToolPageRecord = {
  slug: string;
  title: string;
  page_path: string;
  is_active: number;
  sort_order: number;
  updated_at: string;
};

const TOOL_PAGE_SEEDS = [
  { slug: "word-search-generator", title: "Word Search Generator", path: "/tools/word-search-generator", sort: 0 },
  { slug: "maze-generator", title: "Maze Generator", path: "/tools/maze-generator", sort: 1 },
  { slug: "sudoku-generator", title: "Sudoku Generator", path: "/tools/sudoku-generator", sort: 2 },
] as const;

function ensureToolPagesTable() {
  const db = getLocalDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS tool_pages (
      slug TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      page_path TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO tool_pages (slug, title, page_path, is_active, sort_order, updated_at)
    VALUES (?, ?, ?, 1, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      title = excluded.title,
      page_path = excluded.page_path,
      sort_order = excluded.sort_order
  `);
  const seed = db.transaction(() => {
    for (const item of TOOL_PAGE_SEEDS) insert.run(item.slug, item.title, item.path, item.sort, now);
  });
  seed();
  return db;
}

export function listToolPages() {
  return ensureToolPagesTable().prepare("SELECT * FROM tool_pages ORDER BY sort_order, slug").all() as ToolPageRecord[];
}

export function getToolPage(slug: string) {
  return (ensureToolPagesTable().prepare("SELECT * FROM tool_pages WHERE slug = ? LIMIT 1").get(slug) as ToolPageRecord | undefined) ?? null;
}

export function updateToolPageActive(slug: string, isActive: boolean) {
  ensureToolPagesTable().prepare(`
    UPDATE tool_pages SET is_active = ?, updated_at = ? WHERE slug = ?
  `).run(isActive ? 1 : 0, new Date().toISOString(), slug);
  return getToolPage(slug);
}

export async function writeToolFrontendSnapshot() {
  const target = process.env.PRINTLY_FRONTEND_TOOL_DATA_PATH?.trim()
    ? path.resolve(process.env.PRINTLY_FRONTEND_TOOL_DATA_PATH.trim())
    : path.resolve(process.cwd(), "../site-legacy/data/tool-pages.json");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify({ version: 1, tools: listToolPages() }, null, 2)}\n`, "utf8");
  return target;
}
