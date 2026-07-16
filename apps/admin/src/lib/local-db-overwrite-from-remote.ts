import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import Database from "better-sqlite3";

import { cleanupOrphanedStagedFiles } from "@/lib/local-admin-db";
import { LOCAL_DB_PATH } from "@/lib/local-db-viewer";

const execFileAsync = promisify(execFile);
const WRANGLER_CONFIG_PATH = path.join(process.cwd(), "wrangler.jsonc");
const WRANGLER_TIMEOUT_MS = 60_000;

type RemoteColumnInfo = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
};

type OverwriteTableName =
  | "categories"
  | "actives"
  | "imgs"
  | "homepage_config";

type OverwriteReportItem = {
  table: OverwriteTableName;
  rows: number;
  added_columns: string[];
  note?: string;
};

type OverwriteReport = {
  summary: string;
  tables: OverwriteReportItem[];
  warnings: string[];
};

const OVERWRITE_TABLES: OverwriteTableName[] = [
  "categories",
  "actives",
  "imgs",
  "homepage_config",
];

const CLEAR_TABLES = [
  "imgs",
  "actives",
  "categories",
  "homepage_config",
  "sync_outbox",
  "category_image_delete_queue",
  "sync_runtime_lock",
] as const;

function recreateCategoriesTable(db: Database.Database) {
  const categoryColumns = getLocalColumns(db, "categories").map((column) => column.name);
  const hasLegacyColumns =
    categoryColumns.includes("keywords") ||
    categoryColumns.includes("similar_keywords") ||
    categoryColumns.includes("image_list");

  if (!hasLegacyColumns) {
    return;
  }

  db.exec(`
    DROP TABLE IF EXISTS categories__import_reset;
    CREATE TABLE categories__import_reset (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      remote_id INTEGER NULL,
      parent_id INTEGER NULL,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT NULL,
      name_zh TEXT NULL,
      pose_prompt_specs TEXT NULL,
      cover_image TEXT NULL,
      seo_image_url TEXT NULL,
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending_create',
      local_updated_at TEXT NOT NULL,
      remote_updated_at_snapshot TEXT NULL,
      last_synced_at TEXT NULL,
      deleted_at TEXT NULL,
      FOREIGN KEY (parent_id) REFERENCES categories__import_reset(id)
    );
  `);
  db.exec("DROP TABLE categories");
  db.exec("ALTER TABLE categories__import_reset RENAME TO categories");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_remote_id ON categories(remote_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_categories_deleted_at ON categories(deleted_at)");
}

function now() {
  return new Date().toISOString();
}

function quoteIdent(value: string) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) {
    throw new Error(`非法标识符：${value}`);
  }

  return `"${value}"`;
}

function parseEnvFileContents(content: string) {
  const result: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalizedLine = line.startsWith("export ") ? line.slice(7).trim() : line;
    const separatorIndex = normalizedLine.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = normalizedLine.slice(0, separatorIndex).trim();
    let value = normalizedLine.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

async function loadSyncEnv() {
  const mergedEnv: NodeJS.ProcessEnv = { ...process.env };
  const envFileNames = [".env", ".env.local", ".dev.vars"];

  for (const fileName of envFileNames) {
    const filePath = path.join(process.cwd(), fileName);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const parsed = parseEnvFileContents(content);

      for (const [key, value] of Object.entries(parsed)) {
        if (!mergedEnv[key]) {
          mergedEnv[key] = value;
        }
      }
    } catch (error) {
      const fsError = error as NodeJS.ErrnoException;
      if (fsError.code !== "ENOENT") {
        throw fsError;
      }
    }
  }

  return mergedEnv;
}

async function getCloudflareTarget() {
  const configText = await fs.readFile(WRANGLER_CONFIG_PATH, "utf-8");
  const normalized = configText
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
  const parsed = JSON.parse(normalized) as {
    d1_databases?: Array<{ database_name?: string }>;
  };
  const databaseName = parsed.d1_databases?.[0]?.database_name?.trim();

  if (!databaseName) {
    throw new Error("wrangler.jsonc 中未找到 D1 数据库配置。");
  }

  return databaseName;
}

async function runWranglerJson<T extends Record<string, unknown>>(sql: string) {
  const databaseName = await getCloudflareTarget();
  const env = await loadSyncEnv();

  if (!env.CLOUDFLARE_API_TOKEN?.trim()) {
    throw new Error("需要 CLOUDFLARE_API_TOKEN 才能从远端覆盖本地。");
  }

  try {
    const result = await execFileAsync(
      "npx",
      [
        "wrangler",
        "--config",
        WRANGLER_CONFIG_PATH,
        "d1",
        "execute",
        databaseName,
        "--remote",
        "--command",
        sql,
        "--json",
      ],
      {
        cwd: process.cwd(),
        env,
        maxBuffer: 20 * 1024 * 1024,
        timeout: WRANGLER_TIMEOUT_MS,
      },
    );

    return JSON.parse(`${result.stdout}\n${result.stderr}`.trim()) as Array<{
      results?: T[];
      success?: boolean;
      meta?: Record<string, unknown>;
    }>;
  } catch (error) {
    const execError = error as Error & {
      stdout?: string;
      stderr?: string;
      code?: string | number;
    };
    const output = `${execError.stdout ?? ""}\n${execError.stderr ?? ""}`.trim();
    throw new Error(output || `Wrangler 执行失败：${String(execError.code ?? "unknown")}`);
  }
}

async function remoteQueryAll<T extends Record<string, unknown>>(sql: string) {
  const [result] = await runWranglerJson<T>(sql);
  return result?.results ?? [];
}

async function listRemoteTables() {
  const rows = await remoteQueryAll<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC",
  );

  return new Set(rows.map((row) => String(row.name)));
}

async function getRemoteColumns(table: OverwriteTableName) {
  const rows = await remoteQueryAll<RemoteColumnInfo>(`PRAGMA table_info(${quoteIdent(table)})`);
  return rows.map((row) => ({
    cid: Number(row.cid),
    name: String(row.name),
    type: String(row.type ?? ""),
    notnull: Number(row.notnull ?? 0),
    dflt_value: row.dflt_value === undefined ? null : (row.dflt_value as string | null),
    pk: Number(row.pk ?? 0),
  }));
}

async function getRemoteRows(table: OverwriteTableName, columns: RemoteColumnInfo[]) {
  const pkOrder = [...columns]
    .filter((column) => column.pk > 0)
    .sort((left, right) => left.pk - right.pk)
    .map((column) => quoteIdent(column.name))
    .join(", ");
  const orderBy = pkOrder ? ` ORDER BY ${pkOrder}` : "";
  return remoteQueryAll<Record<string, unknown>>(`SELECT * FROM ${quoteIdent(table)}${orderBy}`);
}

function openLocalWritableDb() {
  return new Database(LOCAL_DB_PATH, { fileMustExist: true });
}

function getLocalColumns(db: Database.Database, table: string) {
  return db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as RemoteColumnInfo[];
}

function fallbackDefaultForType(type: string) {
  return /INT|REAL|NUM/i.test(type) ? "0" : "''";
}

function ensureRemoteColumnsExistLocally(db: Database.Database, table: OverwriteTableName, remoteColumns: RemoteColumnInfo[]) {
  const localColumnNames = new Set(getLocalColumns(db, table).map((column) => column.name));
  const addedColumns: string[] = [];

  for (const column of remoteColumns) {
    if (localColumnNames.has(column.name)) {
      continue;
    }

    const pieces = [quoteIdent(column.name), column.type || "TEXT"];
    if (column.notnull) {
      pieces.push("NOT NULL");
    }

    const defaultValue = column.dflt_value ?? (column.notnull ? fallbackDefaultForType(column.type) : null);
    if (defaultValue !== null) {
      pieces.push(`DEFAULT ${defaultValue}`);
    }

    db.exec(`ALTER TABLE ${quoteIdent(table)} ADD COLUMN ${pieces.join(" ")}`);
    addedColumns.push(column.name);
  }

  return addedColumns;
}

function buildLocalRow(
  table: OverwriteTableName,
  remoteRow: Record<string, unknown>,
  localColumns: RemoteColumnInfo[],
  importedAt: string,
) {
  const row: Record<string, unknown> = {};

  for (const column of localColumns) {
    const name = column.name;
    if (name in remoteRow) {
      row[name] = remoteRow[name];
      continue;
    }

    switch (name) {
      case "remote_id":
        row[name] = typeof remoteRow.id === "number" ? remoteRow.id : Number(remoteRow.id ?? 0);
        break;
      case "sync_status":
        row[name] = "synced";
        break;
      case "local_updated_at":
        row[name] = remoteRow.updated_at ?? importedAt;
        break;
      case "remote_updated_at_snapshot":
        row[name] = remoteRow.updated_at ?? null;
        break;
      case "last_synced_at":
        row[name] = importedAt;
        break;
      case "deleted_at":
        row[name] = null;
        break;
      case "file_sync_status":
        row[name] = "synced";
        break;
      case "remote_file_key":
        row[name] = remoteRow.image_url ?? remoteRow.image_r2_path ?? null;
        break;
      case "remote_file_key_card":
        row[name] = remoteRow.image_url_card ?? remoteRow.image_url ?? null;
        break;
      case "image_url_card":
        row[name] = remoteRow.image_url_card ?? remoteRow.image_url ?? "";
        break;
      case "local_file_path":
      case "local_file_path_card":
      case "previous_remote_file_key":
      case "previous_remote_file_key_card":
      case "file_hash":
        row[name] = null;
        break;
      case "created_at":
      case "updated_at":
        row[name] = remoteRow[name] ?? importedAt;
        break;
      case "cover_image":
      case "seo_image_url":
      case "name_zh":
      case "pose_prompt_specs":
      case "object_key":
      case "payload_snapshot":
      case "last_error":
        row[name] = null;
        break;
      default:
        row[name] = column.dflt_value ?? (column.notnull ? fallbackDefaultForType(column.type).replace(/^'|'$/g, "") : null);
        break;
    }
  }

  if (table === "imgs" && row.remote_file_key_card === null) {
    row.remote_file_key_card = row.remote_file_key;
  }

  return row;
}

function insertRows(db: Database.Database, table: OverwriteTableName, rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    return;
  }

  const columns = Object.keys(rows[0]);
  const sql = `INSERT INTO ${quoteIdent(table)} (${columns.map(quoteIdent).join(", ")}) VALUES (${columns
    .map((column) => `@${column}`)
    .join(", ")})`;
  const statement = db.prepare(sql);
  const insertMany = db.transaction((items: Record<string, unknown>[]) => {
    for (const item of items) {
      statement.run(item);
    }
  });

  insertMany(rows);
}

export async function overwriteLocalTablesFromRemote(): Promise<OverwriteReport> {
  const remoteTables = await listRemoteTables();
  const importedAt = now();
  const db = openLocalWritableDb();
  const warnings: string[] = [];
  const reports: OverwriteReportItem[] = [];

  try {
    db.pragma("foreign_keys = OFF");

    const oldCategoryMappings = db
      .prepare("SELECT id, remote_id FROM categories")
      .all() as Array<{ id: number; remote_id: number | null }>;
    const oldCategoryLocalOnlyFields = db
      .prepare("SELECT remote_id, name_zh, pose_prompt_specs FROM categories WHERE remote_id IS NOT NULL")
      .all() as Array<{
        remote_id: number;
        name_zh: string | null;
        pose_prompt_specs: string | null;
      }>;
    const categoryMapByOldId = new Map<number, number>();
    const categoryLocalOnlyMapByRemoteId = new Map<
      number,
      {
        name_zh: string | null;
        pose_prompt_specs: string | null;
      }
    >();
    oldCategoryMappings.forEach((row) => {
      if (row.remote_id) {
        categoryMapByOldId.set(row.id, row.remote_id);
      }
    });
    oldCategoryLocalOnlyFields.forEach((row) => {
      categoryLocalOnlyMapByRemoteId.set(row.remote_id, {
        name_zh: row.name_zh,
        pose_prompt_specs: row.pose_prompt_specs,
      });
    });

    recreateCategoriesTable(db);

    const tx = db.transaction((remotePayload: Map<OverwriteTableName, { columns: RemoteColumnInfo[]; rows: Record<string, unknown>[] }>) => {
      for (const table of CLEAR_TABLES) {
        db.prepare(`DELETE FROM ${quoteIdent(table)}`).run();
      }

      for (const table of OVERWRITE_TABLES) {
        const payload = remotePayload.get(table);
        if (!payload) {
          continue;
        }

        const localColumns = getLocalColumns(db, table);
        const rows = payload.rows.map((remoteRow) => buildLocalRow(table, remoteRow, localColumns, importedAt));
        insertRows(db, table, rows);
      }

      const restoreCategoryLocalOnly = db.prepare(
        "UPDATE categories SET name_zh = ?, pose_prompt_specs = ? WHERE remote_id = ?",
      );
      categoryLocalOnlyMapByRemoteId.forEach((value, remoteId) => {
        restoreCategoryLocalOnly.run(value.name_zh, value.pose_prompt_specs, remoteId);
      });

      const sources = db.prepare("SELECT id, category_id FROM img_sources").all() as Array<{ id: number; category_id: number }>;
      const updateSource = db.prepare("UPDATE img_sources SET category_id = ? WHERE id = ?");
      const deleteSource = db.prepare("DELETE FROM img_sources WHERE id = ?");
      let remapped = 0;
      let deleted = 0;
      for (const source of sources) {
        const nextCategoryId = categoryMapByOldId.get(source.category_id);
        if (!nextCategoryId) {
          deleteSource.run(source.id);
          deleted += 1;
          continue;
        }

        updateSource.run(nextCategoryId, source.id);
        remapped += 1;
      }

      if (remapped || deleted) {
        warnings.push(`img_sources 已重映射 ${remapped} 条，删除失配 ${deleted} 条。`);
      }
    });

    const remotePayload = new Map<OverwriteTableName, { columns: RemoteColumnInfo[]; rows: Record<string, unknown>[] }>();
    for (const table of OVERWRITE_TABLES) {
      if (!remoteTables.has(table)) {
        warnings.push(`远端不存在表 ${table}，本次跳过。`);
        continue;
      }

      const remoteColumns = await getRemoteColumns(table);
      const addedColumns = ensureRemoteColumnsExistLocally(db, table, remoteColumns);
      const remoteRows = await getRemoteRows(table, remoteColumns);
      remotePayload.set(table, { columns: remoteColumns, rows: remoteRows });
      reports.push({
        table,
        rows: remoteRows.length,
        added_columns: addedColumns,
      });
    }

    tx(remotePayload);
  } finally {
    db.pragma("foreign_keys = ON");
    db.close();
  }

  await cleanupOrphanedStagedFiles(0);

  return {
    summary: `已按远端基线覆盖本地 ${reports.length} 张表的数据，并补齐远端新增字段。`,
    tables: reports,
    warnings: warnings.length > 0
      ? [
          "本次只保留本地同步必需字段；共享业务字段以远端实际结构为准。",
          ...warnings,
        ]
      : ["本次只保留本地同步必需字段；共享业务字段以远端实际结构为准。"],
  };
}
