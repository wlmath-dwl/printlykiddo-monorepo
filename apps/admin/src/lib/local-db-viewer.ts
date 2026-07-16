import path from "node:path";

import Database from "better-sqlite3";

import { LOCAL_DB_VIEW_TABLES, type LocalDbViewTableName } from "@/lib/local-db-viewer-tables";

export type { LocalDbViewTableName };
export { LOCAL_DB_VIEW_TABLES } from "@/lib/local-db-viewer-tables";

const ALLOWED_NAMES = new Set<string>(LOCAL_DB_VIEW_TABLES.map((t) => t.name));

export const LOCAL_DB_PATH = path.join(process.cwd(), "data", "local-admin.sqlite");

function assertAllowedTable(table: string): asserts table is LocalDbViewTableName {
  if (!ALLOWED_NAMES.has(table)) {
    throw new Error("不支持的表名。");
  }

  if (!/^[a-z_][a-z0-9_]*$/i.test(table)) {
    throw new Error("非法表名。");
  }
}

export type LocalDbColumnInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

/** 只读连接，避免与主库写入争用同一连接语义（仍共享 WAL，可并发读） */
function openReadonlyDb() {
  return new Database(LOCAL_DB_PATH, { readonly: true, fileMustExist: true });
}

export function listLocalDbTablesForViewer() {
  return LOCAL_DB_VIEW_TABLES.map((t) => ({ name: t.name, label: t.label }));
}

export function getLocalTableColumns(table: string): LocalDbColumnInfo[] {
  assertAllowedTable(table);
  const db = openReadonlyDb();
  try {
    return db.prepare(`PRAGMA table_info(${table})`).all() as LocalDbColumnInfo[];
  } finally {
    db.close();
  }
}

export type LocalTablePageResult = {
  columns: string[];
  columnInfos: LocalDbColumnInfo[];
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  pageSize: number;
};

export function queryLocalTablePage(table: string, page: number, pageSize: number): LocalTablePageResult {
  assertAllowedTable(table);
  const safePage = Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1;
  const safeSize = Number.isFinite(pageSize)
    ? Math.min(100, Math.max(1, Math.floor(pageSize)))
    : 50;

  const db = openReadonlyDb();
  try {
    const columnInfos = db.prepare(`PRAGMA table_info(${table})`).all() as LocalDbColumnInfo[];
    const columns = columnInfos.map((c) => c.name);
    const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number };
    const total = Number(totalRow.c);
    const offset = (safePage - 1) * safeSize;
    const rows = db.prepare(`SELECT * FROM ${table} LIMIT ? OFFSET ?`).all(safeSize, offset) as Record<
      string,
      unknown
    >[];

    return {
      columns,
      columnInfos,
      rows,
      total,
      page: safePage,
      pageSize: safeSize,
    };
  } finally {
    db.close();
  }
}
