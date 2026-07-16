import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import {
  CATEGORY_IMAGE_SIZES,
  type CategoryImageSize,
  appendCategoryImageSizeSuffix,
  buildLegacyRemoteCategoryImageKey,
  buildPendingCategoryImagePath,
} from "@/lib/category-image";
import { collectCategoryImageIds } from "@/lib/category-image-list";
import {
  acquireSyncRuntimeLock,
  cleanupOrphanedStagedFiles,
  enqueueSyncOutboxItem,
  ensureLocalSyncIntegrity,
  getRawActiveById,
  getRawCategoryById,
  getHomepageConfig,
  getRawHomepageConfigById,
  getRawImgById,
  getRawSpecialPageById,
  getSyncSummary,
  listQueuedCategoryImageDeletes,
  listRawActives,
  listRawCategories,
  listRawImgs,
  listSyncQueue,
  markActiveSynced,
  markCategorySynced,
  markImgFileSynced,
  markImgSynced,
  markSpecialPageSynced,
  markOutboxFailed,
  markOutboxSynced,
  markOutboxSyncing,
  purgeDeletedActive,
  purgeDeletedCategory,
  purgeDeletedImg,
  purgeDeletedSpecialPage,
  recoverAbandonedSyncRuntimeLock,
  releaseSyncRuntimeLock,
  removeQueuedCategoryImageDelete,
  resolveCategoryImageObjectKey,
  retryFailedOutbox,
  updateHomepagePrintableStats,
  type SyncQueueItem,
} from "@/lib/local-admin-db";
import {
  copyManagedFile,
  deleteManagedFile,
  hasManagedFile,
  resolveManagedFilePath,
} from "@/lib/local-image-storage";

const execFileAsync = promisify(execFile);
const WRANGLER_CONFIG_PATH = path.join(process.cwd(), "wrangler.jsonc");
const WRANGLER_BIN_PATH = path.join(
  process.cwd(),
  "node_modules",
  ".bin",
  "wrangler",
);
const WRANGLER_TIMEOUT_MS = 60_000;
const OPENNEXT_ISR_CACHE_BINDING = "NEXT_INC_CACHE_R2_BUCKET";
const OPENNEXT_ISR_CACHE_DEFAULT_PREFIX = "incremental-cache";
const ADMIN_OPENNEXT_CACHE_BUCKET_NAME = "printly-admin-opennext-cache";

/**
 * This copied admin belongs to the isolated monorepo migration workspace.
 * Remote D1/R2 writes and Cloudflare API calls are denied by default. A future
 * production cutover must remove this guard deliberately; setting credentials
 * alone is not enough to make this workspace write online.
 */
const LOCAL_MIGRATION_MODE = process.env.PRINTLY_LOCAL_ONLY !== "0";

function assertRemoteSyncAllowed() {
  if (LOCAL_MIGRATION_MODE) {
    throw new Error("当前 Monorepo 处于本地迁移模式，已禁止 D1/R2/Cloudflare 线上同步。");
  }
}

let cachedCloudflareTarget: {
  d1DatabaseName: string;
  r2BucketName: string;
  isrCacheR2BucketName: string | null;
} | null = null;

let cachedCloudflareAccountId: string | null = null;

type SqlValue = string | number | null;

type WranglerConfigBinding = {
  binding?: string;
  bucket_name?: string;
  database_name?: string;
};

type CloudflareApiResponse<T> = {
  success: boolean;
  result: T;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: string[];
  result_info?: {
    cursor?: string;
    is_truncated?: boolean;
  };
};

type R2ObjectListItem = {
  key?: string;
};

type RemoteSnapshotRow = {
  id: number;
  updated_at: string | null;
  parent_id?: number | null;
};

type RemoteHomepageRow = {
  id: number;
  hero_image_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  footer_paragraph: string | null;
  category_printable_counts?: string | null;
  total_printable_count?: number | string | null;
  updated_at: string | null;
};

type RemoteSpecialPageRow = {
  id: number;
  hero_image_url: string | null;
  card_image_url: string | null;
  updated_at: string | null;
};

type SyncDiffItem = {
  entity_type: "category" | "active" | "img";
  local_id: number | null;
  remote_id: number | null;
  message: string;
  resolution: "local_wins";
};

type SyncQueueIssue = {
  id: number;
  entity_type: string;
  entity_id: number;
  operation: string;
  retry_count: number;
  last_error: string | null;
  updated_at: string;
};

type SyncRunResult = {
  summary: Awaited<ReturnType<typeof getSyncSummary>>;
  processed_count: number;
  success_count: number;
  failure_count: number;
  results: Array<{
    id: number | string;
    entity_type: string;
    entity_id: number | string;
    operation: string;
    success: boolean;
    error?: string;
  }>;
  failed_items: SyncQueueIssue[];
};

type SyncRuntimeLogEntry = {
  timestamp: string;
  message: string;
};

type SyncRuntimeSnapshot = {
  run_id: string | null;
  status: "idle" | "running" | "paused" | "completed" | "failed";
  started_at: string | null;
  finished_at: string | null;
  processed_count: number;
  total_count: number;
  pause_requested: boolean;
  entries: SyncRuntimeLogEntry[];
  result: SyncRunResult | null;
  error: string | null;
};

function formatIntegrityEntityIds(ids: number[]) {
  const visible = ids.slice(0, 10);
  const suffix = ids.length > visible.length ? ` 等 ${ids.length} 项` : "";
  return `${visible.map((id) => `#${id}`).join(", ")}${suffix}`;
}

async function assertSyncDataIntegrity() {
  const integrity = await ensureLocalSyncIntegrity();
  const issues: string[] = [];

  if (integrity.orphan_categories.length > 0) {
    issues.push(
      `孤儿分类 ${formatIntegrityEntityIds(
        integrity.orphan_categories.map((item) => item.id),
      )}`,
    );
  }

  if (integrity.orphan_imgs.length > 0) {
    issues.push(
      `孤儿图片 ${formatIntegrityEntityIds(
        integrity.orphan_imgs.map((item) => item.id),
      )}`,
    );
  }

  if (integrity.orphan_img_sources.length > 0) {
    issues.push(
      `孤儿原始图 ${formatIntegrityEntityIds(
        integrity.orphan_img_sources.map((item) => item.id),
      )}`,
    );
  }

  if (issues.length > 0) {
    throw new Error(`检测到本地脏数据，请先清理后再同步：${issues.join("；")}`);
  }

  return integrity.removed_orphan_outbox_count;
}

const SYNC_RUNTIME_NAMESPACE = "__printlyAdminSyncRuntime";
const MAX_SYNC_LOG_ENTRIES = 500;

function now() {
  return new Date().toISOString();
}

function getSyncRuntimeStore() {
  const scopedGlobal = globalThis as typeof globalThis & {
    [SYNC_RUNTIME_NAMESPACE]?: SyncRuntimeSnapshot;
  };

  if (!scopedGlobal[SYNC_RUNTIME_NAMESPACE]) {
    scopedGlobal[SYNC_RUNTIME_NAMESPACE] = {
      run_id: null,
      status: "idle",
      started_at: null,
      finished_at: null,
      processed_count: 0,
      total_count: 0,
      pause_requested: false,
      entries: [],
      result: null,
      error: null,
    };
  }

  return scopedGlobal[SYNC_RUNTIME_NAMESPACE];
}

function appendSyncRuntimeLog(message: string) {
  const store = getSyncRuntimeStore();
  store.entries = [
    ...store.entries,
    {
      timestamp: now(),
      message,
    },
  ].slice(-MAX_SYNC_LOG_ENTRIES);
}

function startSyncRuntime(
  runId: string,
  totalCount: number,
  initialMessage?: string,
) {
  const store = getSyncRuntimeStore();
  store.run_id = runId;
  store.status = "running";
  store.started_at = now();
  store.finished_at = null;
  store.processed_count = 0;
  store.total_count = totalCount;
  store.pause_requested = false;
  store.entries = [];
  store.result = null;
  store.error = null;

  if (initialMessage) {
    appendSyncRuntimeLog(initialMessage);
  }
}

function updateSyncRuntimeProcessed(processedCount: number) {
  const store = getSyncRuntimeStore();
  store.processed_count = processedCount;
}

function finishSyncRuntime(
  status: "paused" | "completed" | "failed",
  result: SyncRunResult | null,
  error?: string,
) {
  const store = getSyncRuntimeStore();
  store.status = status;
  store.finished_at = now();
  store.pause_requested = false;
  store.result = result;
  store.error = error ?? null;
}

function isSyncPauseRequested() {
  return getSyncRuntimeStore().pause_requested;
}

export async function requestSyncPause() {
  const store = getSyncRuntimeStore();

  if (store.status !== "running") {
    return {
      paused: false,
      already_stopped: true,
      sync_run: getSyncRuntimeSnapshot(),
      summary: await getSyncSummary(),
    };
  }

  if (!store.pause_requested) {
    store.pause_requested = true;
    store.status = "paused";
    appendSyncRuntimeLog("收到暂停请求：已停止继续调度，当前处理步骤收尾后退出。");
  }

  return {
    paused: true,
    already_stopped: false,
    sync_run: getSyncRuntimeSnapshot(),
    summary: await getSyncSummary(),
  };
}

function getSyncRuntimeSnapshot() {
  const store = getSyncRuntimeStore();
  return {
    run_id: store.run_id,
    status: store.status,
    started_at: store.started_at,
    finished_at: store.finished_at,
    processed_count: store.processed_count,
    total_count: store.total_count,
    pause_requested: store.pause_requested,
    entries: [...store.entries],
    result: store.result,
    error: store.error,
  } satisfies SyncRuntimeSnapshot;
}

async function acquireSyncLockForNewRun(owner: string) {
  const acquired = await acquireSyncRuntimeLock(owner);

  if (acquired) {
    return {
      acquired: true,
      recovered: null,
    };
  }

  const runtime = getSyncRuntimeSnapshot();
  if (runtime.status === "running") {
    return {
      acquired: false,
      recovered: null,
    };
  }

  const recovered = await recoverAbandonedSyncRuntimeLock();
  return {
    acquired: await acquireSyncRuntimeLock(owner),
    recovered,
  };
}

function serializeSqlValue(value: SqlValue) {
  if (value === null) {
    return "NULL";
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }

  return `'${value.replaceAll("'", "''")}'`;
}

function inlineSqlParams(sql: string, params: SqlValue[]) {
  let index = 0;

  return sql.replace(/\?/g, () => {
    const value = params[index];
    index += 1;
    return serializeSqlValue(value ?? null);
  });
}

function parseEnvFileContents(content: string) {
  const result: Record<string, string> = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const normalizedLine = line.startsWith("export ")
      ? line.slice(7).trim()
      : line;
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

async function runWrangler(args: string[]) {
  assertRemoteSyncAllowed();
  const target = await getCloudflareTarget();
  const wranglerEnv = await loadSyncEnv();
  const apiToken = wranglerEnv.CLOUDFLARE_API_TOKEN?.trim();

  if (!apiToken) {
    throw new Error(
      "一键同步需要 `CLOUDFLARE_API_TOKEN`。请把它配置到 `printly-admin` 的 `.env.local` 或 `.dev.vars`，或启动服务的环境变量中。",
    );
  }

  try {
    const result = await execFileAsync(
      WRANGLER_BIN_PATH,
      ["--config", WRANGLER_CONFIG_PATH, ...args],
      {
        cwd: process.cwd(),
        env: wranglerEnv,
        maxBuffer: 20 * 1024 * 1024,
        timeout: WRANGLER_TIMEOUT_MS,
      },
    );

    return {
      output: `${result.stdout}\n${result.stderr}`.trim(),
      target,
    };
  } catch (error) {
    const execError = error as Error & {
      code?: string | number;
      stdout?: string;
      stderr?: string;
      signal?: string;
      killed?: boolean;
    };
    const output =
      `${execError.stdout ?? ""}\n${execError.stderr ?? ""}`.trim();

    // Wrangler/npm can occasionally exit non-zero after D1 has already returned a
    // complete successful JSON response (for example when npm emits config warnings
    // during shutdown). In that case the query did succeed, so do not turn the valid
    // result into a sync failure. Only recover when every returned statement explicitly
    // reports success; malformed, partial, or genuinely failed responses still throw.
    if (args.includes("--json") && execError.stdout?.trim()) {
      try {
        const parsed = JSON.parse(execError.stdout) as unknown;
        if (
          Array.isArray(parsed) &&
          parsed.length > 0 &&
          parsed.every(
            (item) =>
              typeof item === "object" &&
              item !== null &&
              (item as { success?: unknown }).success === true,
          )
        ) {
          return {
            output: execError.stdout.trim(),
            target,
          };
        }
      } catch {
        // Continue through the normal Wrangler error handling below.
      }
    }

    if (execError.code === "ENOENT") {
      throw new Error("未找到 wrangler 命令，请先确认依赖安装完成。");
    }

    if (execError.killed || execError.signal === "SIGTERM") {
      throw new Error("Wrangler 执行超时，请检查网络连接后重试。");
    }

    if (
      /CLOUDFLARE_API_TOKEN|Failed to fetch auth token|non-interactive environment/i.test(
        output,
      )
    ) {
      throw new Error(
        "Cloudflare 凭证不可用：请在 `printly-admin` 的 `.env.local`、`.dev.vars` 或服务端环境变量中设置有效的 `CLOUDFLARE_API_TOKEN`。",
      );
    }

    if (/not authenticated|authentication|required|login/i.test(output)) {
      throw new Error(
        "Cloudflare 凭证不可用：一键同步运行在非交互环境，请改为配置 `CLOUDFLARE_API_TOKEN`，不要依赖 `wrangler login`。",
      );
    }

    throw new Error(
      output || `Wrangler 执行失败：${String(execError.code ?? "unknown")}`,
    );
  }
}

/** Upload a local managed file to the site's image R2 bucket without creating a D1 row. */
export async function uploadManagedPuzzleFileToR2(
  objectKey: string,
  localFilePath: string,
) {
  const target = await getCloudflareTarget();
  const absolutePath = resolveManagedFilePath(localFilePath);
  await runWrangler([
    "r2",
    "object",
    "put",
    `${target.r2BucketName}/${objectKey}`,
    "--remote",
    "--file",
    absolutePath,
  ]);
  return objectKey;
}

/** Delete a generated puzzle object from the site's image R2 bucket. */
export async function deleteManagedPuzzleFileFromR2(objectKey: string) {
  const target = await getCloudflareTarget();
  await runWrangler([
    "r2",
    "object",
    "delete",
    `${target.r2BucketName}/${objectKey}`,
    "--remote",
  ]);
}

async function getCloudflareAccountId() {
  if (cachedCloudflareAccountId) {
    return cachedCloudflareAccountId;
  }

  const wranglerEnv = await loadSyncEnv();
  const envAccountId = wranglerEnv.CLOUDFLARE_ACCOUNT_ID?.trim();

  if (envAccountId) {
    cachedCloudflareAccountId = envAccountId;
    return cachedCloudflareAccountId;
  }

  const { output } = await runWrangler(["whoami", "--json"]);
  let parsed: {
    accounts?: Array<{ id?: string }>;
  };

  try {
    parsed = JSON.parse(output) as typeof parsed;
  } catch {
    throw new Error("无法解析 Wrangler 账号信息，请配置 `CLOUDFLARE_ACCOUNT_ID`。");
  }

  const accounts = parsed.accounts?.filter((account) => account.id);

  if (!accounts || accounts.length === 0) {
    throw new Error("无法从 Wrangler 获取 Cloudflare Account ID，请配置 `CLOUDFLARE_ACCOUNT_ID`。");
  }

  if (accounts.length > 1) {
    throw new Error("检测到多个 Cloudflare 账号，请配置 `CLOUDFLARE_ACCOUNT_ID`。");
  }

  cachedCloudflareAccountId = accounts[0].id ?? null;

  if (!cachedCloudflareAccountId) {
    throw new Error("无法从 Wrangler 获取 Cloudflare Account ID，请配置 `CLOUDFLARE_ACCOUNT_ID`。");
  }

  return cachedCloudflareAccountId;
}

function formatCloudflareApiErrors(errors: CloudflareApiResponse<unknown>["errors"]) {
  if (!errors || errors.length === 0) {
    return "Cloudflare API 调用失败。";
  }

  return errors
    .map((error) => [error.code, error.message].filter(Boolean).join(": "))
    .join("；");
}

async function cloudflareApiFetch<T>(
  pathName: string,
  init?: RequestInit,
  ignoredErrorCodes: number[] = [],
) {
  assertRemoteSyncAllowed();
  const wranglerEnv = await loadSyncEnv();
  const apiToken = wranglerEnv.CLOUDFLARE_API_TOKEN?.trim();

  if (!apiToken) {
    throw new Error(
      "清理线上 ISR 缓存需要 `CLOUDFLARE_API_TOKEN`。请把它配置到 `printly-admin` 的 `.env.local` 或 `.dev.vars`，或启动服务的环境变量中。",
    );
  }

  const response = await fetch(`https://api.cloudflare.com/client/v4${pathName}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (response.status === 404) {
    return null;
  }

  const body = (await response.json()) as CloudflareApiResponse<T>;

  if (!response.ok || !body.success) {
    if (
      body.errors?.length &&
      body.errors.every(
        (error) =>
          typeof error.code === "number" &&
          ignoredErrorCodes.includes(error.code),
      )
    ) {
      return null;
    }

    throw new Error(formatCloudflareApiErrors(body.errors));
  }

  return body;
}

async function getCloudflareTarget() {
  if (cachedCloudflareTarget) {
    return cachedCloudflareTarget;
  }

  const configText = await fs.readFile(WRANGLER_CONFIG_PATH, "utf-8");
  const normalized = configText
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/,\s*([}\]])/g, "$1");
  const parsed = JSON.parse(normalized) as {
    d1_databases?: WranglerConfigBinding[];
    r2_buckets?: WranglerConfigBinding[];
  };
  const imageBucket =
    parsed.r2_buckets?.find((bucket) => bucket.binding === "IMAGE_BUCKET") ??
    parsed.r2_buckets?.[0];
  const configuredIsrCacheR2Bucket =
    process.env.CLOUDFLARE_ISR_CACHE_R2_BUCKET ??
    process.env.OPENNEXT_CACHE_R2_BUCKET ??
    null;
  const openNextCacheR2Bucket = parsed.r2_buckets?.find(
    (bucket) => bucket.binding === OPENNEXT_ISR_CACHE_BINDING,
  )?.bucket_name;
  const isrCacheR2Bucket =
    configuredIsrCacheR2Bucket ??
    (openNextCacheR2Bucket === ADMIN_OPENNEXT_CACHE_BUCKET_NAME
      ? imageBucket?.bucket_name
      : openNextCacheR2Bucket) ??
    null;
  const d1DatabaseName =
    process.env.CLOUDFLARE_D1_DATABASE_NAME ??
    parsed.d1_databases?.[0]?.database_name;
  const r2BucketName =
    process.env.CLOUDFLARE_R2_BUCKET_NAME ??
    imageBucket?.bucket_name;

  if (!d1DatabaseName || !r2BucketName) {
    throw new Error("无法从 wrangler 配置中解析 D1 或 R2 目标。");
  }

  cachedCloudflareTarget = {
    d1DatabaseName,
    r2BucketName,
    isrCacheR2BucketName: isrCacheR2Bucket,
  };

  return cachedCloudflareTarget;
}

async function runWranglerJson<T extends Record<string, unknown>>(sql: string) {
  const target = await getCloudflareTarget();
  const { output } = await runWrangler([
    "d1",
    "execute",
    target.d1DatabaseName,
    "--remote",
    "--command",
    sql,
    "--json",
  ]);

  try {
    return JSON.parse(output) as Array<{
      results?: T[];
      success?: boolean;
      meta?: Record<string, unknown>;
    }>;
  } catch {
    throw new Error(output || "Wrangler 未返回有效 JSON。");
  }
}

async function remoteQueryAll<T extends Record<string, unknown>>(
  sql: string,
  params: SqlValue[] = [],
) {
  const [result] = await runWranglerJson<T>(inlineSqlParams(sql, params));
  return result?.results ?? [];
}

async function remoteExecute(sql: string, params: SqlValue[] = []) {
  const [result] = await runWranglerJson(inlineSqlParams(sql, params));
  return result?.meta ?? {};
}

async function remoteExists(
  table: "categories" | "actives" | "imgs" | "special_pages",
  id: number,
) {
  const row = await remoteQueryAll<{ id: number }>(
    `SELECT id FROM ${table} WHERE id = ? LIMIT 1`,
    [id],
  );
  return row.length > 0;
}

async function ensureRemoteSpecialPagesTable() {
  await remoteExecute(
    `CREATE TABLE IF NOT EXISTS special_pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      subtitle TEXT NULL,
      description TEXT NULL,
      seo_title TEXT NULL,
      seo_description TEXT NULL,
      hero_image_url TEXT NULL,
      card_image_url TEXT NULL,
      theme_color TEXT NOT NULL DEFAULT '#7ADDE8',
      status TEXT NOT NULL DEFAULT 'draft',
      sort_order INTEGER NOT NULL DEFAULT 0,
      content_json TEXT NOT NULL DEFAULT '{"items":[]}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT NULL
    )`,
  );
  await remoteExecute(
    "CREATE INDEX IF NOT EXISTS idx_special_pages_status_sort ON special_pages(status, sort_order, id)",
  );
  await remoteExecute(
    "CREATE INDEX IF NOT EXISTS idx_special_pages_deleted_at ON special_pages(deleted_at)",
  );
  const columns = await remoteQueryAll<{ name: string }>("PRAGMA table_info(special_pages)");
  const names = new Set(columns.map((column) => String(column.name)));
  if (!names.has("card_image_url")) {
    await remoteExecute("ALTER TABLE special_pages ADD COLUMN card_image_url TEXT NULL");
  }
  if (!names.has("theme_color")) {
    await remoteExecute("ALTER TABLE special_pages ADD COLUMN theme_color TEXT NOT NULL DEFAULT '#7ADDE8'");
  }
}

async function remoteCount(sql: string, params: SqlValue[] = []) {
  const rows = await remoteQueryAll<{ count: number | string }>(sql, params);
  const value = rows[0]?.count;
  return Number(value ?? 0);
}

async function ensureRemoteHomepageConfigStatColumns() {
  const columns = await remoteQueryAll<{ name: string }>("PRAGMA table_info(homepage_config)");
  const names = new Set(columns.map((column) => String(column.name)));

  if (!names.has("category_printable_counts")) {
    await remoteExecute(
      "ALTER TABLE homepage_config ADD COLUMN category_printable_counts TEXT NOT NULL DEFAULT '{}'",
    );
  }

  if (!names.has("total_printable_count")) {
    await remoteExecute(
      "ALTER TABLE homepage_config ADD COLUMN total_printable_count INTEGER NOT NULL DEFAULT 0",
    );
  }
}

async function listR2ObjectKeysByPrefix(
  accountId: string,
  bucketName: string,
  prefix: string,
  cursor?: string,
) {
  const params = new URLSearchParams({
    per_page: "1000",
    prefix,
  });

  if (cursor) {
    params.set("cursor", cursor);
  }

  const body = await cloudflareApiFetch<R2ObjectListItem[]>(
    `/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucketName)}/objects?${params.toString()}`,
  );

  if (!body) {
    throw new Error(`线上 ISR 缓存 bucket 不存在：${bucketName}`);
  }

  return {
    keys: body.result
      .map((item) => item.key)
      .filter((key): key is string => typeof key === "string" && key.length > 0),
    cursor: body.result_info?.cursor,
    isTruncated: body.result_info?.is_truncated === true,
  };
}

function encodeR2ObjectKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

async function deleteR2Object(accountId: string, bucketName: string, key: string) {
  await cloudflareApiFetch(
    `/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucketName)}/objects/${encodeR2ObjectKey(key)}`,
    { method: "DELETE" },
    // R2 error 10007 means the object is already absent. Deletion is idempotent,
    // so the corresponding local cleanup task can be removed safely.
    [10007],
  );
}

async function deleteR2Objects(
  accountId: string,
  bucketName: string,
  keys: string[],
  concurrency = 10,
) {
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, keys.length) }, async () => {
      while (nextIndex < keys.length) {
        const key = keys[nextIndex];
        nextIndex += 1;
        await deleteR2Object(accountId, bucketName, key);
      }
    }),
  );
}

export async function purgeOnlineIsrCache() {
  const target = await getCloudflareTarget();
  const bucketName = target.isrCacheR2BucketName;

  if (!bucketName) {
    throw new Error(
      `未配置线上 ISR 缓存 R2 bucket，请在 wrangler.jsonc 配置 ${OPENNEXT_ISR_CACHE_BINDING}。`,
    );
  }

  const accountId = await getCloudflareAccountId();
  const prefix = `${(await loadSyncEnv()).NEXT_INC_CACHE_R2_PREFIX?.trim() || OPENNEXT_ISR_CACHE_DEFAULT_PREFIX}/`;
  let cursor: string | undefined;
  let deletedCount = 0;

  do {
    const page = await listR2ObjectKeysByPrefix(accountId, bucketName, prefix, cursor);

    if (page.keys.length > 0) {
      await deleteR2Objects(accountId, bucketName, page.keys);
      deletedCount += page.keys.length;
    }

    cursor = page.isTruncated ? page.cursor : undefined;
  } while (cursor);

  return {
    bucketName,
    prefix,
    deletedCount,
  };
}

function normalizeFrontendRevalidateEndpoint(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (/\/api\/revalidate(?:\?|$)/.test(trimmed)) {
    return trimmed;
  }

  return `${trimmed.replace(/\/+$/, "")}/api/revalidate`;
}

function buildFrontendRevalidateEndpoint(value: string) {
  const endpoint = normalizeFrontendRevalidateEndpoint(value);
  if (!endpoint) {
    return "";
  }

  const url = new URL(endpoint);
  if (!url.searchParams.has("purge")) {
    url.searchParams.set("purge", "isr");
  }
  if (!url.searchParams.has("scope")) {
    url.searchParams.set("scope", "layout");
  }

  return url.toString();
}

export async function notifyFrontendRevalidate() {
  assertRemoteSyncAllowed();
  const syncEnv = await loadSyncEnv();
  const endpoint = buildFrontendRevalidateEndpoint(
    syncEnv.FRONTEND_REVALIDATE_URL?.trim() ||
      syncEnv.PRINTLYKIDDO_REVALIDATE_URL?.trim() ||
      syncEnv.PRINTLYKIDDO_SITE_URL?.trim() ||
      "https://printlykiddo.com/api/revalidate",
  );
  const token =
    syncEnv.FRONTEND_REVALIDATE_TOKEN?.trim() ||
    syncEnv.PRINTLYKIDDO_REVALIDATE_TOKEN?.trim() ||
    syncEnv.REVALIDATE_TOKEN?.trim();

  if (!endpoint) {
    throw new Error("未配置前台 revalidate 地址。");
  }

  if (!token) {
    throw new Error(
      "通知前台 revalidate 需要 `FRONTEND_REVALIDATE_TOKEN` 或 `REVALIDATE_TOKEN`。",
    );
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  const bodyText = await response.text();

  if (!response.ok) {
    throw new Error(
      `前台 revalidate 失败：${response.status} ${response.statusText} ${bodyText}`,
    );
  }

  return {
    endpoint,
    status: response.status,
    body: bodyText,
  };
}

async function fetchRemoteSnapshots() {
  const [categories, actives, imgs] = await Promise.all([
    remoteQueryAll<RemoteSnapshotRow>(
      "SELECT id, updated_at, parent_id FROM categories",
    ),
    remoteQueryAll<RemoteSnapshotRow>("SELECT id, updated_at FROM actives"),
    remoteQueryAll<RemoteSnapshotRow>("SELECT id, updated_at FROM imgs"),
  ]);

  return {
    categories,
    actives,
    imgs,
  };
}

function compareLocalWithRemote(options: {
  entityType: "category" | "active" | "img";
  localRows: Array<{
    id: number;
    remote_id: number | null;
    sync_status: string;
    remote_updated_at_snapshot: string | null;
    deleted_at: string | null;
    file_sync_status?: string | null;
  }>;
  remoteRows: RemoteSnapshotRow[];
}) {
  const remoteMap = new Map<number, RemoteSnapshotRow>();
  options.remoteRows.forEach((row) => {
    remoteMap.set(Number(row.id), row);
  });

  const conflicts: SyncDiffItem[] = [];
  const remoteOnly: SyncDiffItem[] = [];
  const pendingUpstream: SyncDiffItem[] = [];

  options.localRows.forEach((row) => {
    if (options.entityType === "img" && row.file_sync_status === "draft") {
      return;
    }

    if (!row.remote_id) {
      pendingUpstream.push({
        entity_type: options.entityType,
        local_id: row.id,
        remote_id: null,
        message: "本地存在未上推记录。",
        resolution: "local_wins",
      });
      return;
    }

    const remote = remoteMap.get(row.remote_id);

    if (!remote) {
      pendingUpstream.push({
        entity_type: options.entityType,
        local_id: row.id,
        remote_id: row.remote_id,
        message: row.deleted_at
          ? "远端记录待删除。"
          : "远端缺失，将按本地重新上推。",
        resolution: "local_wins",
      });
      return;
    }

    remoteMap.delete(row.remote_id);

    if (
      row.remote_updated_at_snapshot &&
      remote.updated_at &&
      row.remote_updated_at_snapshot !== remote.updated_at &&
      row.sync_status !== "synced"
    ) {
      conflicts.push({
        entity_type: options.entityType,
        local_id: row.id,
        remote_id: row.remote_id,
        message: "远端版本已变化，同步时仍按本地覆盖。",
        resolution: "local_wins",
      });
    }
  });

  remoteMap.forEach((row) => {
    remoteOnly.push({
      entity_type: options.entityType,
      local_id: null,
      remote_id: Number(row.id),
      message: "远端存在本地未纳管记录。",
      resolution: "local_wins",
    });
  });

  return {
    conflicts,
    remoteOnly,
    pendingUpstream,
  };
}

async function enqueueLocalWinsReconcileItems(options: {
  entityType: "category" | "active" | "img";
  localRows: Array<{
    id: number;
    remote_id: number | null;
    sync_status: string;
    remote_updated_at_snapshot: string | null;
    deleted_at: string | null;
    file_sync_status?: string | null;
  }>;
  remoteRows: RemoteSnapshotRow[];
}) {
  const remoteMap = new Map<number, RemoteSnapshotRow>();
  options.remoteRows.forEach((row) => {
    remoteMap.set(Number(row.id), row);
  });

  let queuedCount = 0;

  for (const row of options.localRows) {
    if (row.deleted_at) {
      continue;
    }

    if (options.entityType === "img" && row.file_sync_status === "draft") {
      continue;
    }

    if (!row.remote_id) {
      if (await enqueueSyncOutboxItem(options.entityType, row.id, "create")) {
        queuedCount += 1;
      }
      continue;
    }

    const remote = remoteMap.get(row.remote_id);
    if (!remote) {
      if (await enqueueSyncOutboxItem(options.entityType, row.id, "update")) {
        queuedCount += 1;
      }
      continue;
    }

    if (
      row.remote_updated_at_snapshot &&
      remote.updated_at &&
      row.remote_updated_at_snapshot !== remote.updated_at &&
      await enqueueSyncOutboxItem(options.entityType, row.id, "update")
    ) {
      queuedCount += 1;
    }
  }

  return queuedCount;
}

function buildCategoryDepthMap(
  categories: Array<{
    id: number;
    parent_id: number | null;
  }>,
) {
  const rowsById = new Map(categories.map((row) => [row.id, row]));
  const depthCache = new Map<number, number>();

  const getDepth = (categoryId: number, visiting = new Set<number>()): number => {
    const cached = depthCache.get(categoryId);
    if (cached !== undefined) {
      return cached;
    }

    if (visiting.has(categoryId)) {
      return 0;
    }

    const row = rowsById.get(categoryId);
    if (!row || row.parent_id === null) {
      depthCache.set(categoryId, 0);
      return 0;
    }

    visiting.add(categoryId);
    const depth = getDepth(row.parent_id, visiting) + 1;
    visiting.delete(categoryId);
    depthCache.set(categoryId, depth);
    return depth;
  };

  return {
    get(categoryId: number) {
      return getDepth(categoryId);
    },
  };
}

function compareCategoryQueueItems(
  left: SyncQueueItem,
  right: SyncQueueItem,
  categoryDepthMap: ReturnType<typeof buildCategoryDepthMap>,
) {
  if (left.entity_type !== "category" || right.entity_type !== "category") {
    return 0;
  }

  const leftIsDelete = left.operation === "delete";
  const rightIsDelete = right.operation === "delete";

  if (leftIsDelete !== rightIsDelete) {
    return 0;
  }

  const leftDepth = categoryDepthMap.get(left.entity_id);
  const rightDepth = categoryDepthMap.get(right.entity_id);

  if (leftIsDelete) {
    if (leftDepth !== rightDepth) {
      return rightDepth - leftDepth;
    }
  } else if (leftDepth !== rightDepth) {
    return leftDepth - rightDepth;
  }

  return left.id - right.id;
}

function sortQueue(
  items: SyncQueueItem[],
  categories: Array<{
    id: number;
    parent_id: number | null;
  }>,
) {
  const categoryDepthMap = buildCategoryDepthMap(categories);

  const priority = (item: SyncQueueItem) => {
    if (item.operation === "delete") {
      if (item.entity_type === "img") {
        return 10;
      }

      if (item.entity_type === "category") {
        return 20;
      }

      if (item.entity_type === "active") {
        return 30;
      }

      if (item.entity_type === "img_file") {
        return 40;
      }

      if (item.entity_type === "homepage") {
        return 50;
      }

      if (item.entity_type === "special_page") {
        return 60;
      }

      return 100;
    }

    if (item.entity_type === "active") {
      return 10;
    }

    if (item.entity_type === "category") {
      return 20;
    }

    if (item.entity_type === "img_file") {
      return 30;
    }

    if (item.entity_type === "img") {
      return 40;
    }

    if (item.entity_type === "homepage") {
      return 50;
    }

    if (item.entity_type === "special_page") {
      return 60;
    }

    return 100;
  };

  return [...items].sort((left, right) => {
    const diff = priority(left) - priority(right);

    if (diff !== 0) {
      return diff;
    }

    const categoryDiff = compareCategoryQueueItems(left, right, categoryDepthMap);
    if (categoryDiff !== 0) {
      return categoryDiff;
    }

    return left.id - right.id;
  });
}

function mapQueueIssue(item: SyncQueueItem): SyncQueueIssue {
  return {
    id: item.id,
    entity_type: item.entity_type,
    entity_id: item.entity_id,
    operation: item.operation,
    retry_count: item.retry_count,
    last_error: item.last_error,
    updated_at: item.updated_at,
  };
}

function formatSyncResultLogEntry(entry: {
  entity_type: string;
  entity_id: number | string;
  operation: string;
  success: boolean;
  error?: string;
}) {
  const status = entry.success ? "SUCCESS" : "FAILED";
  const operation = entry.operation;
  const entityType = entry.entity_type;
  const entityId = String(entry.entity_id);
  const suffix = entry.error?.trim() ? ` | ${entry.error.trim()}` : "";
  return `${status} | ${entityType}#${entityId} | ${operation}${suffix}`;
}

function normalizeCategoryImageId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function collectReferencedCategoryImageIds(options: { cover_image?: unknown }) {
  return collectCategoryImageIds(options.cover_image);
}

function parseQueuedCategoryImageDeleteKeys(item: { image_id: string; object_key: string | null }) {
  const raw = item.object_key?.trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
      }
    } catch {
      return [raw];
    }
    return [raw];
  }

  const legacyKey = buildLegacyRemoteCategoryImageKey(item.image_id);
  return CATEGORY_IMAGE_SIZES.map((size) => appendCategoryImageSizeSuffix(legacyKey, size));
}

function buildSizedCategoryObjectKeys(objectKey: string) {
  return CATEGORY_IMAGE_SIZES.map((size) => ({
    size,
    objectKey: appendCategoryImageSizeSuffix(objectKey, size),
  }));
}

async function r2ObjectExists(accountId: string, bucketName: string, key: string) {
  const page = await listR2ObjectKeysByPrefix(accountId, bucketName, key);
  return page.keys.includes(key);
}

async function syncCategoryImages(
  row: Record<string, unknown>,
  options: { forceUpload?: boolean } = {},
) {
  for (const imageId of collectReferencedCategoryImageIds({
    cover_image: row.cover_image,
  })) {
    const pendingPath = buildPendingCategoryImagePath(imageId);
    const objectKey = await resolveCategoryImageObjectKey(imageId, {
      includeDeleted: true,
    });
    const target = await getCloudflareTarget();
    let accountId: string | null = null;
    let uploadedAny = false;
    const verifiedObjectKeys: string[] = [];

    for (const { size, objectKey: sizedObjectKey } of buildSizedCategoryObjectKeys(objectKey)) {
      const sizedPendingPath = buildPendingCategoryImagePath(imageId, size as CategoryImageSize);
      const hasMirrorFile = await hasManagedFile(sizedObjectKey);
      const hasPendingFile = await hasManagedFile(sizedPendingPath);

      // Mirror files are retained locally after upload. If pending files are gone, verify the
      // remote object before skipping so interrupted or partial syncs can self-heal.
      if (!hasPendingFile && !options.forceUpload) {
        accountId = accountId ?? await getCloudflareAccountId();
        if (await r2ObjectExists(accountId, target.r2BucketName, sizedObjectKey)) {
          verifiedObjectKeys.push(sizedObjectKey);
          continue;
        }

        if (!hasMirrorFile) {
          throw new Error(
            `分类封面同步失败：本地源文件和 R2 对象均不存在（${sizedObjectKey}）。`,
          );
        }
      }

      if (!hasMirrorFile && hasPendingFile) {
        await copyManagedFile(sizedPendingPath, sizedObjectKey);
      }

      const sourcePath = (await hasManagedFile(sizedObjectKey))
        ? sizedObjectKey
        : sizedPendingPath;
      const absolutePath = resolveManagedFilePath(sourcePath);

      try {
        await fs.access(absolutePath);
      } catch {
        accountId = accountId ?? await getCloudflareAccountId();
        if (await r2ObjectExists(accountId, target.r2BucketName, sizedObjectKey)) {
          verifiedObjectKeys.push(sizedObjectKey);
          continue;
        }
        throw new Error(
          `分类封面同步失败：找不到可上传的本地文件，且 R2 对象不存在（${sizedObjectKey}）。`,
        );
      }

      await runWrangler([
        "r2",
        "object",
        "put",
        `${target.r2BucketName}/${sizedObjectKey}`,
        "--remote",
        "--file",
        absolutePath,
      ]);
      uploadedAny = true;

      accountId = accountId ?? await getCloudflareAccountId();
      if (!(await r2ObjectExists(accountId, target.r2BucketName, sizedObjectKey))) {
        throw new Error(
          `分类封面上传后校验失败：R2 对象不存在（${sizedObjectKey}）。`,
        );
      }
      verifiedObjectKeys.push(sizedObjectKey);

      if (hasPendingFile) {
        await deleteManagedFile(sizedPendingPath);
      }
    }

    const expectedObjectKeys = buildSizedCategoryObjectKeys(objectKey).map(
      ({ objectKey: sizedObjectKey }) => sizedObjectKey,
    );
    const missingVerifiedObjectKeys = expectedObjectKeys.filter(
      (sizedObjectKey) => !verifiedObjectKeys.includes(sizedObjectKey),
    );
    if (missingVerifiedObjectKeys.length > 0) {
      throw new Error(
        `分类封面同步失败：以下 R2 对象未通过校验：${missingVerifiedObjectKeys.join(", ")}`,
      );
    }

    if (!uploadedAny && await hasManagedFile(pendingPath)) {
      await deleteManagedFile(pendingPath);
    }

    return uploadedAny;
  }

  return false;
}

async function syncCategorySeoImage(row: Record<string, unknown>) {
  const raw = row.seo_image_url;
  const seoImageUrl = typeof raw === "string" ? raw.trim() : "";

  if (!seoImageUrl || /^(https?:)?\/\//i.test(seoImageUrl)) {
    return;
  }

  const objectKey = seoImageUrl.replace(/^\/+/, "");
  const absolutePath = resolveManagedFilePath(objectKey);

  try {
    await fs.access(absolutePath);
  } catch {
    return;
  }

  const target = await getCloudflareTarget();
  await runWrangler([
    "r2",
    "object",
    "put",
    `${target.r2BucketName}/${objectKey}`,
    "--remote",
    "--file",
    absolutePath,
  ]);
}

async function syncCategory(item: SyncQueueItem) {
  const row = await getRawCategoryById(item.entity_id);

  if (!row) {
    return;
  }

  if (row.deleted_at) {
    if (row.remote_id) {
      const childCategoryCount = await remoteCount(
        "SELECT COUNT(*) AS count FROM categories WHERE parent_id = ?",
        [row.remote_id],
      );
      if (childCategoryCount > 0) {
        throw new Error(
          `远端仍有 ${childCategoryCount} 个子分类依赖该分类，请先删除子分类。`,
        );
      }

      const imgCount = await remoteCount(
        "SELECT COUNT(*) AS count FROM imgs WHERE category_id = ?",
        [row.remote_id],
      );
      if (imgCount > 0) {
        throw new Error(
          `远端仍有 ${imgCount} 张图片依赖该分类，请先删除关联图片。`,
        );
      }

      await remoteExecute("DELETE FROM categories WHERE id = ?", [
        row.remote_id,
      ]);
    }

    await purgeDeletedCategory(row.id);
    return;
  }

  const parentRemoteId =
    row.parent_id === null
      ? null
      : ((await getRawCategoryById(row.parent_id))?.remote_id ?? null);

  if (row.parent_id !== null && !parentRemoteId) {
    throw new Error("上级分类尚未同步到远端。");
  }

  const queuedCategoryImageDeletes = await listQueuedCategoryImageDeletes();
  const coverImageId = normalizeCategoryImageId(
    (row as Record<string, unknown>).cover_image,
  );
  const forceImageUpload =
    item.operation === "create" ||
    (coverImageId !== null &&
      queuedCategoryImageDeletes.some((entry) => entry.image_id === coverImageId));
  const uploadedCategoryImage = await syncCategoryImages(
    row as Record<string, unknown>,
    { forceUpload: forceImageUpload },
  );
  if (uploadedCategoryImage || forceImageUpload) {
    await syncCategorySeoImage(row as Record<string, unknown>);
  }

  const timestamp = now();
  const remoteUpdatable = row.remote_id
    ? await remoteExists("categories", row.remote_id)
    : false;
  const coverImage = normalizeCategoryImageId(
    (row as Record<string, unknown>).cover_image,
  );
  const seoImageUrl =
    typeof (row as Record<string, unknown>).seo_image_url === "string"
      ? String((row as Record<string, unknown>).seo_image_url).trim() || null
      : null;
  let remoteId = row.remote_id;

  if (remoteUpdatable && row.remote_id) {
    await remoteExecute(
      `UPDATE categories
       SET parent_id = ?, name = ?, slug = ?, description = ?, cover_image = ?, seo_image_url = ?, sort_order = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
      [
        parentRemoteId,
        row.name,
        row.slug,
        row.description,
        coverImage,
        seoImageUrl,
        row.sort_order,
        row.is_active ? 1 : 0,
        timestamp,
        row.remote_id,
      ],
    );
  } else {
    const result = await remoteExecute(
      `INSERT INTO categories
        (parent_id, name, slug, description, cover_image, seo_image_url, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parentRemoteId,
        row.name,
        row.slug,
        row.description,
        coverImage,
        seoImageUrl,
        row.sort_order,
        row.is_active ? 1 : 0,
        timestamp,
        timestamp,
      ],
    );
    remoteId = Number(result.last_row_id ?? row.remote_id);
  }

  if (!remoteId) {
    throw new Error("远端分类创建后未返回有效 ID。");
  }

  await markCategorySynced(row.id, remoteId, timestamp);
}

async function syncActive(item: SyncQueueItem) {
  const row = await getRawActiveById(item.entity_id);

  if (!row) {
    return;
  }

  if (row.deleted_at) {
    if (row.remote_id) {
      const imgCount = await remoteCount(
        "SELECT COUNT(*) AS count FROM imgs WHERE active_id = ?",
        [row.remote_id],
      );
      if (imgCount > 0) {
        throw new Error(
          `远端仍有 ${imgCount} 张图片依赖该功能，请先删除关联图片。`,
        );
      }

      await remoteExecute("DELETE FROM actives WHERE id = ?", [row.remote_id]);
    }

    await purgeDeletedActive(row.id);
    return;
  }

  const timestamp = now();
  const remoteUpdatable = row.remote_id
    ? await remoteExists("actives", row.remote_id)
    : false;
  let remoteId = row.remote_id;

  if (remoteUpdatable && row.remote_id) {
    await remoteExecute(
      `UPDATE actives
       SET name = ?, slug = ?, description = ?, sort_order = ?, colored_label = ?, updated_at = ?
       WHERE id = ?`,
      [
        row.name,
        row.slug,
        row.description,
        row.sort_order,
        row.colored_label ? 1 : 0,
        timestamp,
        row.remote_id,
      ],
    );
  } else {
    const result = await remoteExecute(
      `INSERT INTO actives
        (name, slug, description, sort_order, colored_label, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        row.name,
        row.slug,
        row.description,
        row.sort_order,
        row.colored_label ? 1 : 0,
        timestamp,
        timestamp,
      ],
    );
    remoteId = Number(result.last_row_id ?? row.remote_id);
  }

  if (!remoteId) {
    throw new Error("远端功能创建后未返回有效 ID。");
  }

  await markActiveSynced(row.id, remoteId, timestamp);
}

async function syncImgFile(item: SyncQueueItem) {
  const row = await getRawImgById(item.entity_id);

  if (!row) {
    return;
  }

  if (
    row.deleted_at &&
    (row.remote_file_key || row.remote_file_key_card || row.previous_remote_file_key || row.previous_remote_file_key_card)
  ) {
    const target = await getCloudflareTarget();
    const keysToDelete = new Set<string>();
    if (row.remote_file_key) keysToDelete.add(row.remote_file_key);
    if (row.remote_file_key_card) keysToDelete.add(row.remote_file_key_card);
    if (row.previous_remote_file_key) keysToDelete.add(row.previous_remote_file_key);
    if (row.previous_remote_file_key_card) keysToDelete.add(row.previous_remote_file_key_card);

    for (const key of keysToDelete) {
      await runWrangler([
        "r2",
        "object",
        "delete",
        `${target.r2BucketName}/${key}`,
        "--remote",
      ]);
    }
    await markImgFileSynced(row.id, row.image_url, row.image_url_card);
    return;
  }

  if (!row.local_file_path && !row.local_file_path_card) {
    if (
      row.previous_remote_file_key &&
      row.previous_remote_file_key !== row.image_url
    ) {
      const target = await getCloudflareTarget();
      await runWrangler([
        "r2",
        "object",
        "delete",
        `${target.r2BucketName}/${row.previous_remote_file_key}`,
        "--remote",
      ]);
    }

    if (
      row.previous_remote_file_key_card &&
      row.previous_remote_file_key_card !== row.image_url_card &&
      row.previous_remote_file_key_card !== row.previous_remote_file_key
    ) {
      const target = await getCloudflareTarget();
      await runWrangler([
        "r2",
        "object",
        "delete",
        `${target.r2BucketName}/${row.previous_remote_file_key_card}`,
        "--remote",
      ]);
    }

    await markImgFileSynced(row.id, row.image_url, row.image_url_card);
    return;
  }

  const target = await getCloudflareTarget();
  if (row.local_file_path) {
    const absolutePath = resolveManagedFilePath(row.local_file_path);
    await runWrangler([
      "r2",
      "object",
      "put",
      `${target.r2BucketName}/${row.image_url}`,
      "--remote",
      "--file",
      absolutePath,
    ]);
  }

  if (row.local_file_path_card) {
    const absolutePathCard = resolveManagedFilePath(row.local_file_path_card);
    await runWrangler([
      "r2",
      "object",
      "put",
      `${target.r2BucketName}/${row.image_url_card}`,
      "--remote",
      "--file",
      absolutePathCard,
    ]);
  }

  if (
    row.previous_remote_file_key &&
    row.previous_remote_file_key !== row.image_url
  ) {
    await runWrangler([
      "r2",
      "object",
      "delete",
      `${target.r2BucketName}/${row.previous_remote_file_key}`,
      "--remote",
    ]);
  }

  if (
    row.previous_remote_file_key_card &&
    row.previous_remote_file_key_card !== row.image_url_card &&
    row.previous_remote_file_key_card !== row.previous_remote_file_key
  ) {
    await runWrangler([
      "r2",
      "object",
      "delete",
      `${target.r2BucketName}/${row.previous_remote_file_key_card}`,
      "--remote",
    ]);
  }

  await markImgFileSynced(row.id, row.image_url, row.image_url_card);
}

async function syncImg(item: SyncQueueItem) {
  const row = await getRawImgById(item.entity_id);

  if (!row) {
    return;
  }

  if (row.deleted_at) {
    if (row.remote_id) {
      await remoteExecute("DELETE FROM imgs WHERE id = ?", [row.remote_id]);
    }

    // 清理当前已同步的 R2 文件
    const target = await getCloudflareTarget();
    const keysToDelete = new Set<string>();
    if (row.remote_file_key) keysToDelete.add(row.remote_file_key);
    if (row.remote_file_key_card) keysToDelete.add(row.remote_file_key_card);
    if (row.previous_remote_file_key) keysToDelete.add(row.previous_remote_file_key);
    if (row.previous_remote_file_key_card) keysToDelete.add(row.previous_remote_file_key_card);

    for (const key of keysToDelete) {
      await runWrangler([
        "r2",
        "object",
        "delete",
        `${target.r2BucketName}/${key}`,
        "--remote",
      ]);
    }

    await purgeDeletedImg(row.id);
    return;
  }

  const category = await getRawCategoryById(row.category_id);
  const active = await getRawActiveById(row.active_id);

  if (!category?.remote_id) {
    throw new Error("图片关联的分类尚未同步到远端。");
  }

  if (!active?.remote_id) {
    throw new Error("图片关联的功能尚未同步到远端。");
  }

  if (row.file_sync_status !== "synced") {
    if (row.file_sync_status === "draft") {
      return;
    }
    throw new Error("图片文件尚未同步完成。");
  }

  const timestamp = now();
  const remoteUpdatable = row.remote_id
    ? await remoteExists("imgs", row.remote_id)
    : false;
  let remoteId = row.remote_id;

  if (remoteUpdatable && row.remote_id) {
    await remoteExecute(
      `UPDATE imgs
       SET category_id = ?, active_id = ?, image_url = ?, image_url_card = ?, title = ?, slug = ?, description = ?, difficulty = ?, sort_order = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
      [
        category.remote_id,
        active.remote_id,
        row.image_url,
        row.image_url_card,
        row.title,
        row.slug,
        row.description,
        row.difficulty ?? null,
        row.sort_order,
        row.is_active ? 1 : 0,
        timestamp,
        row.remote_id,
      ],
    );
  } else {
    const result = await remoteExecute(
      `INSERT INTO imgs
        (category_id, active_id, image_url, image_url_card, title, slug, description, difficulty, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        category.remote_id,
        active.remote_id,
        row.image_url,
        row.image_url_card,
        row.title,
        row.slug,
        row.description,
        row.difficulty ?? null,
        row.sort_order,
        row.is_active ? 1 : 0,
        timestamp,
        timestamp,
      ],
    );
    remoteId = Number(result.last_row_id ?? row.remote_id);
  }

  if (!remoteId) {
    throw new Error("远端图片创建后未返回有效 ID。");
  }

  await markImgSynced(row.id, remoteId, timestamp);
}

async function uploadManagedImageObjectIfNeeded(options: {
  objectKey: string;
  missingMessage: string;
  remoteHasSameKey?: boolean;
}) {
  const objectKey = options.objectKey.trim();
  if (!objectKey || /^(https?:)?\/\//i.test(objectKey)) {
    return;
  }

  const absolutePath = resolveManagedFilePath(objectKey);
  let hasLocalFile = true;

  try {
    await fs.access(absolutePath);
  } catch {
    hasLocalFile = false;
  }

  if (!hasLocalFile && !options.remoteHasSameKey) {
    throw new Error(options.missingMessage);
  }

  if (!hasLocalFile) {
    return;
  }

  const target = await getCloudflareTarget();
  await runWrangler([
    "r2",
    "object",
    "put",
    `${target.r2BucketName}/${objectKey}`,
    "--remote",
    "--file",
    absolutePath,
  ]);
}

async function deleteRemoteImageObject(objectKey?: string | null) {
  const key = objectKey?.trim();
  if (!key || /^(https?:)?\/\//i.test(key)) {
    return;
  }

  const target = await getCloudflareTarget();
  await runWrangler([
    "r2",
    "object",
    "delete",
    `${target.r2BucketName}/${key}`,
    "--remote",
  ]);
}

async function syncSpecialPage(item: SyncQueueItem) {
  const row = await getRawSpecialPageById(item.entity_id);

  if (!row) {
    return;
  }

  await ensureRemoteSpecialPagesTable();

  if (row.deleted_at) {
    if (row.remote_id) {
      const remoteRows = await remoteQueryAll<RemoteSpecialPageRow>(
        "SELECT id, hero_image_url, card_image_url, updated_at FROM special_pages WHERE id = ? LIMIT 1",
        [row.remote_id],
      );
      await deleteRemoteImageObject(remoteRows[0]?.hero_image_url);
      await deleteRemoteImageObject(remoteRows[0]?.card_image_url);
      await remoteExecute("DELETE FROM special_pages WHERE id = ?", [row.remote_id]);
    }
    await purgeDeletedSpecialPage(row.id);
    return;
  }

  const remoteUpdatable = row.remote_id
    ? await remoteExists("special_pages", row.remote_id)
    : false;
  const remoteRow = remoteUpdatable && row.remote_id
    ? (await remoteQueryAll<RemoteSpecialPageRow>(
        "SELECT id, hero_image_url, card_image_url, updated_at FROM special_pages WHERE id = ? LIMIT 1",
        [row.remote_id],
      ))[0] ?? null
    : null;
  const heroImageUrl = row.hero_image_url?.trim() ?? "";
  const cardImageUrl = row.card_image_url?.trim() ?? "";

  await uploadManagedImageObjectIfNeeded({
    objectKey: heroImageUrl,
    missingMessage: "专题 Hero 图片本地文件不存在，无法同步到线上。",
    remoteHasSameKey: remoteRow?.hero_image_url?.trim() === heroImageUrl,
  });
  await uploadManagedImageObjectIfNeeded({
    objectKey: cardImageUrl,
    missingMessage: "专题卡片小图本地文件不存在，无法同步到线上。",
    remoteHasSameKey: remoteRow?.card_image_url?.trim() === cardImageUrl,
  });

  const timestamp = now();
  let remoteId = row.remote_id;

  if (remoteUpdatable && row.remote_id) {
    await remoteExecute(
      `UPDATE special_pages
       SET title = ?, slug = ?, subtitle = ?, description = ?, seo_title = ?, seo_description = ?, hero_image_url = ?, card_image_url = ?, theme_color = ?, status = ?, sort_order = ?, content_json = ?, updated_at = ?, deleted_at = NULL
       WHERE id = ?`,
      [
        row.title,
        row.slug,
        row.subtitle ?? null,
        row.description ?? null,
        row.seo_title ?? null,
        row.seo_description ?? null,
        heroImageUrl || null,
        cardImageUrl || null,
        row.theme_color || "#7ADDE8",
        row.status,
        row.sort_order,
        row.content_json || '{"items":[]}',
        timestamp,
        row.remote_id,
      ],
    );
  } else {
    const result = await remoteExecute(
      `INSERT INTO special_pages
        (title, slug, subtitle, description, seo_title, seo_description, hero_image_url, card_image_url, theme_color, status, sort_order, content_json, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        row.title,
        row.slug,
        row.subtitle ?? null,
        row.description ?? null,
        row.seo_title ?? null,
        row.seo_description ?? null,
        heroImageUrl || null,
        cardImageUrl || null,
        row.theme_color || "#7ADDE8",
        row.status,
        row.sort_order,
        row.content_json || '{"items":[]}',
        timestamp,
        timestamp,
      ],
    );
    remoteId = Number(result.last_row_id ?? row.remote_id);
  }

  if (!remoteId) {
    throw new Error("远端专题页创建后未返回有效 ID。");
  }

  const previousHeroImageUrl = remoteRow?.hero_image_url?.trim() ?? "";
  if (previousHeroImageUrl && previousHeroImageUrl !== heroImageUrl) {
    await deleteRemoteImageObject(previousHeroImageUrl);
  }
  const previousCardImageUrl = remoteRow?.card_image_url?.trim() ?? "";
  if (previousCardImageUrl && previousCardImageUrl !== cardImageUrl) {
    await deleteRemoteImageObject(previousCardImageUrl);
  }

  await markSpecialPageSynced(row.id, remoteId, timestamp);
}

function calculateHomepagePrintableStats(options: {
  categories: Awaited<ReturnType<typeof listRawCategories>>;
  imgs: Awaited<ReturnType<typeof listRawImgs>>;
}) {
  const activeCategories = new Map(
    options.categories
      .filter((category) => !category.deleted_at && category.is_active)
      .map((category) => [category.id, category]),
  );
  const rootSlugByCategoryId = new Map<number, string | null>();

  function getRootSlug(categoryId: number): string | null {
    if (rootSlugByCategoryId.has(categoryId)) {
      return rootSlugByCategoryId.get(categoryId) ?? null;
    }

    const category = activeCategories.get(categoryId);
    if (!category) {
      rootSlugByCategoryId.set(categoryId, null);
      return null;
    }

    if (!category.parent_id) {
      rootSlugByCategoryId.set(categoryId, category.slug);
      return category.slug;
    }

    const rootSlug = getRootSlug(category.parent_id);
    rootSlugByCategoryId.set(categoryId, rootSlug);
    return rootSlug;
  }

  const counts: Record<string, number> = {};

  for (const img of options.imgs) {
    if (img.deleted_at || !img.is_active) {
      continue;
    }

    const rootSlug = getRootSlug(img.category_id);
    if (!rootSlug) {
      continue;
    }

    counts[rootSlug] = (counts[rootSlug] ?? 0) + 1;
  }

  const sortedCounts = Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)),
  ) as Record<string, number>;

  return {
    category_printable_counts: JSON.stringify(sortedCounts),
    total_printable_count: Object.values(sortedCounts).reduce((sum, count) => sum + count, 0),
  };
}

async function syncHomepageConfig(item: SyncQueueItem) {
  const row = await getRawHomepageConfigById(item.entity_id);

  if (!row) {
    return;
  }

  await ensureRemoteHomepageConfigStatColumns();

  const remoteRows = await remoteQueryAll<RemoteHomepageRow>(
    "SELECT id, hero_image_url, seo_title, seo_description, footer_paragraph, category_printable_counts, total_printable_count, updated_at FROM homepage_config ORDER BY id DESC",
  );
  const remoteRow = remoteRows[0] ?? null;
  const staleRemoteRows = remoteRows.slice(1);
  const target = await getCloudflareTarget();
  const heroImageUrl = row.hero_image_url.trim();
  const isRemoteUrl = /^(https?:)?\/\//i.test(heroImageUrl);
  if (heroImageUrl && !isRemoteUrl) {
    const absolutePath = resolveManagedFilePath(heroImageUrl);
    let hasLocalFile = true;

    try {
      await fs.access(absolutePath);
    } catch {
      hasLocalFile = false;
    }

    const remoteHasSameHero =
      remoteRow?.hero_image_url?.trim() === heroImageUrl;
    if (!hasLocalFile && !remoteHasSameHero) {
      throw new Error("首页 Hero 图片本地文件不存在，无法同步到线上。");
    }

    if (hasLocalFile) {
      await runWrangler([
        "r2",
        "object",
        "put",
        `${target.r2BucketName}/${heroImageUrl}`,
        "--remote",
        "--file",
        absolutePath,
      ]);
    }
  }

  const timestamp = now();
  if (remoteRow) {
    await remoteExecute(
      `UPDATE homepage_config
       SET title = ?, description = ?, hero_image_url = ?, seo_title = ?, seo_description = ?, footer_paragraph = ?, category_printable_counts = ?, total_printable_count = ?, updated_at = ?
       WHERE id = ?`,
      [
        row.title,
        row.description,
        heroImageUrl,
        row.seo_title ?? "",
        row.seo_description ?? "",
        row.footer_paragraph ?? "",
        row.category_printable_counts ?? "{}",
        Number(row.total_printable_count ?? 0),
        timestamp,
        remoteRow.id,
      ],
    );
  } else {
    await remoteExecute(
      `INSERT INTO homepage_config
        (title, description, hero_image_url, seo_title, seo_description, footer_paragraph, category_printable_counts, total_printable_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.title,
        row.description,
        heroImageUrl,
        row.seo_title ?? "",
        row.seo_description ?? "",
        row.footer_paragraph ?? "",
        row.category_printable_counts ?? "{}",
        Number(row.total_printable_count ?? 0),
        timestamp,
        timestamp,
      ],
    );
  }

  const previousHeroImageUrl = remoteRow?.hero_image_url?.trim() ?? "";
  if (
    previousHeroImageUrl &&
    previousHeroImageUrl !== heroImageUrl &&
    !/^(https?:)?\/\//i.test(previousHeroImageUrl)
  ) {
    await runWrangler([
      "r2",
      "object",
      "delete",
      `${target.r2BucketName}/${previousHeroImageUrl}`,
      "--remote",
    ]);
  }

  for (const staleRemoteRow of staleRemoteRows) {
    const staleHeroImageUrl = staleRemoteRow.hero_image_url?.trim() ?? "";
    if (
      staleHeroImageUrl &&
      staleHeroImageUrl !== heroImageUrl &&
      !/^(https?:)?\/\//i.test(staleHeroImageUrl)
    ) {
      await runWrangler([
        "r2",
        "object",
        "delete",
        `${target.r2BucketName}/${staleHeroImageUrl}`,
        "--remote",
      ]);
    }
    await remoteExecute("DELETE FROM homepage_config WHERE id = ?", [
      staleRemoteRow.id,
    ]);
  }
}

async function syncHomepagePrintableStats(options: {
  categories: Awaited<ReturnType<typeof listRawCategories>>;
  imgs: Awaited<ReturnType<typeof listRawImgs>>;
}) {
  const stats = calculateHomepagePrintableStats(options);
  await updateHomepagePrintableStats(stats);
  const row = await getHomepageConfig();

  await ensureRemoteHomepageConfigStatColumns();
  const remoteRows = await remoteQueryAll<RemoteHomepageRow>(
    "SELECT id, hero_image_url, seo_title, seo_description, footer_paragraph, category_printable_counts, total_printable_count, updated_at FROM homepage_config ORDER BY id DESC",
  );
  const remoteRow = remoteRows[0] ?? null;
  const timestamp = now();

  if (remoteRow) {
    await remoteExecute(
      `UPDATE homepage_config
       SET category_printable_counts = ?, total_printable_count = ?, updated_at = ?
       WHERE id = ?`,
      [
        stats.category_printable_counts,
        stats.total_printable_count,
        timestamp,
        remoteRow.id,
      ],
    );
  } else {
    await remoteExecute(
      `INSERT INTO homepage_config
        (title, description, hero_image_url, seo_title, seo_description, footer_paragraph, category_printable_counts, total_printable_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.title,
        row.description,
        row.hero_image_url ?? "",
        row.seo_title ?? "",
        row.seo_description ?? "",
        row.footer_paragraph ?? "",
        stats.category_printable_counts,
        stats.total_printable_count,
        timestamp,
        timestamp,
      ],
    );
  }

  return stats;
}

async function processQueueItem(item: SyncQueueItem) {
  if (item.entity_type === "active") {
    await syncActive(item);
    return;
  }

  if (item.entity_type === "category") {
    await syncCategory(item);
    return;
  }

  if (item.entity_type === "img_file") {
    await syncImgFile(item);
    return;
  }

  if (item.entity_type === "img") {
    await syncImg(item);
    return;
  }

  if (item.entity_type === "homepage") {
    await syncHomepageConfig(item);
    return;
  }

  if (item.entity_type === "special_page") {
    await syncSpecialPage(item);
    return;
  }

  throw new Error(`不支持的同步实体类型：${item.entity_type}`);
}

export async function getSyncStatus() {
  return {
    ...(await getSyncSummary()),
    sync_run: getSyncRuntimeSnapshot(),
  };
}

export async function checkSync() {
  const [
    summary,
    localCategories,
    localActives,
    localImgs,
    remoteSnapshots,
    failedItems,
  ] = await Promise.all([
    getSyncSummary(),
    listRawCategories(),
    listRawActives(),
    listRawImgs(),
    fetchRemoteSnapshots(),
    listSyncQueue(["failed"]),
  ]);

  const categoryDiff = compareLocalWithRemote({
    entityType: "category",
    localRows: localCategories,
    remoteRows: remoteSnapshots.categories,
  });
  const activeDiff = compareLocalWithRemote({
    entityType: "active",
    localRows: localActives,
    remoteRows: remoteSnapshots.actives,
  });
  const imgDiff = compareLocalWithRemote({
    entityType: "img",
    localRows: localImgs,
    remoteRows: remoteSnapshots.imgs,
  });

  return {
    summary,
    conflicts: [
      ...categoryDiff.conflicts,
      ...activeDiff.conflicts,
      ...imgDiff.conflicts,
    ],
    remote_only: [
      ...categoryDiff.remoteOnly,
      ...activeDiff.remoteOnly,
      ...imgDiff.remoteOnly,
    ],
    pending_upstream: [
      ...categoryDiff.pendingUpstream,
      ...activeDiff.pendingUpstream,
      ...imgDiff.pendingUpstream,
    ],
    failed_items: failedItems.map(mapQueueIssue),
  };
}

async function deleteRemoteOnlyItems(
  items: SyncDiffItem[],
  remoteSnapshots: Awaited<ReturnType<typeof fetchRemoteSnapshots>>,
) {
  const remoteCategoryMap = new Map(
    remoteSnapshots.categories.map((row) => [Number(row.id), row]),
  );

  const imgItems = items.filter((item) => item.entity_type === "img");
  const activeItems = items.filter((item) => item.entity_type === "active");
  const categoryItems = items
    .filter((item) => item.entity_type === "category")
    .sort((left, right) => {
      // 按深度排序：子分类先删除，父分类后删除
      const getDepth = (remoteId: number | null): number => {
        if (!remoteId) return 0;
        let depth = 0;
        let currentId: number | null = remoteId;
        while (currentId !== null) {
          const row = remoteCategoryMap.get(currentId);
          if (!row || row.parent_id === undefined || row.parent_id === null) break;
          depth += 1;
          currentId = Number(row.parent_id);
        }
        return depth;
      };
      const leftDepth = getDepth(left.remote_id);
      const rightDepth = getDepth(right.remote_id);
      if (leftDepth !== rightDepth) {
        return rightDepth - leftDepth; // 深层先删
      }
      return (right.remote_id ?? 0) - (left.remote_id ?? 0);
    });

  for (const item of imgItems) {
    if (!item.remote_id) {
      continue;
    }

    const remoteRows = await remoteQueryAll<{ image_url: string | null; image_url_card: string | null }>(
      "SELECT image_url, image_url_card FROM imgs WHERE id = ? LIMIT 1",
      [item.remote_id],
    );
    const imageUrl = remoteRows[0]?.image_url?.trim();
    const imageUrlCard = remoteRows[0]?.image_url_card?.trim();

    const target = await getCloudflareTarget();
    const keysToDelete = new Set<string>();
    if (imageUrl) keysToDelete.add(imageUrl);
    if (imageUrlCard && imageUrlCard !== imageUrl) keysToDelete.add(imageUrlCard);

    for (const key of keysToDelete) {
      await runWrangler([
        "r2",
        "object",
        "delete",
        `${target.r2BucketName}/${key}`,
        "--remote",
      ]);
    }

    await remoteExecute("DELETE FROM imgs WHERE id = ?", [item.remote_id]);
  }

  for (const item of categoryItems) {
    if (!item.remote_id) {
      continue;
    }

    await remoteExecute("DELETE FROM categories WHERE id = ?", [
      item.remote_id,
    ]);
  }

  for (const item of activeItems) {
    if (!item.remote_id) {
      continue;
    }

    await remoteExecute("DELETE FROM actives WHERE id = ?", [item.remote_id]);
  }
}

async function syncQueuedCategoryImageDeletes() {
  const pendingDeletes = await listQueuedCategoryImageDeletes();

  if (pendingDeletes.length === 0) {
    return [];
  }

  const target = await getCloudflareTarget();
  const accountId = await getCloudflareAccountId();
  const results: Array<{
    id: string;
    entity_type: string;
    entity_id: string;
    operation: string;
    success: boolean;
    error?: string;
  }> = [];

  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(3, pendingDeletes.length) },
    async () => {
      while (nextIndex < pendingDeletes.length) {
        const item = pendingDeletes[nextIndex];
        nextIndex += 1;

    try {
      const currentCategories = await listRawCategories();
      const stillReferenced = currentCategories.some(
        (category) =>
          !category.deleted_at &&
          collectReferencedCategoryImageIds({
            cover_image: (category as Record<string, unknown>).cover_image,
          }).includes(item.image_id),
      );
      const protectedKeys = new Set<string>();

      if (stillReferenced) {
        const currentObjectKey = await resolveCategoryImageObjectKey(
          item.image_id,
        );
        buildSizedCategoryObjectKeys(currentObjectKey).forEach(({ objectKey }) => {
          protectedKeys.add(objectKey);
        });
      }

      for (const objectKey of parseQueuedCategoryImageDeleteKeys(item)) {
        if (protectedKeys.has(objectKey)) {
          appendSyncRuntimeLog(
            `SKIP | category_image_file#${item.image_id} | delete | 当前分类仍在引用 ${objectKey}`,
          );
          continue;
        }
        await deleteR2Object(accountId, target.r2BucketName, objectKey);
      }
      await removeQueuedCategoryImageDelete(item.image_id);
      results.push({
        id: `category-image-delete:${item.image_id}`,
        entity_type: "category_image_file",
        entity_id: item.image_id,
        operation: "delete",
        success: true,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "删除分类图片失败。";
      results.push({
        id: `category-image-delete:${item.image_id}`,
        entity_type: "category_image_file",
        entity_id: item.image_id,
        operation: "delete",
        success: false,
        error: message,
      });
    }
      }
    },
  );

  await Promise.all(workers);

  return results;
}

async function estimateSyncTotalCount(options: { reconcileRemote?: boolean } = {}) {
  const queue = await listSyncQueue(["pending", "failed"]);

  // 分类图片删除仅会在前序队列全部成功后执行；手动同步和默认同步都将其计入总数，
  // 这样顶部“共计”更接近用户看到的最终处理项数量。
  const deleteQueue = await listQueuedCategoryImageDeletes();

  if (!options.reconcileRemote) {
    return queue.length + deleteQueue.length;
  }

  // 手动同步会先执行 reconcile 入队，再处理现有 outbox，因此这里给出当前已知总量；
  // 后续若 reconcile 额外新增队列项，processed 会继续增长，但不会低于这个基线。
  return queue.length + deleteQueue.length;
}

async function runSyncInternal(options: { reconcileRemote?: boolean } = {}) {
  const removedOrphanOutboxCount = await assertSyncDataIntegrity();
  if (removedOrphanOutboxCount > 0) {
    appendSyncRuntimeLog(
      `已自动清理 ${removedOrphanOutboxCount} 条失效同步队列记录。`,
    );
  }

  const [localCategories, localActives, localImgs, remoteSnapshots] =
    await Promise.all([
      listRawCategories(),
      listRawActives(),
      listRawImgs(),
      fetchRemoteSnapshots(),
    ]);

  const categoryDiff = compareLocalWithRemote({
    entityType: "category",
    localRows: localCategories,
    remoteRows: remoteSnapshots.categories,
  });
  const activeDiff = compareLocalWithRemote({
    entityType: "active",
    localRows: localActives,
    remoteRows: remoteSnapshots.actives,
  });
  const imgDiff = compareLocalWithRemote({
    entityType: "img",
    localRows: localImgs,
    remoteRows: remoteSnapshots.imgs,
  });
  const remoteOnlyItems = [
    ...categoryDiff.remoteOnly,
    ...activeDiff.remoteOnly,
    ...imgDiff.remoteOnly,
  ];

  if (remoteOnlyItems.length > 0) {
    await deleteRemoteOnlyItems(remoteOnlyItems, remoteSnapshots);
  }

  if (options.reconcileRemote) {
    const [categoryQueued, activeQueued, imgQueued] = await Promise.all([
      enqueueLocalWinsReconcileItems({
        entityType: "category",
        localRows: localCategories,
        remoteRows: remoteSnapshots.categories,
      }),
      enqueueLocalWinsReconcileItems({
        entityType: "active",
        localRows: localActives,
        remoteRows: remoteSnapshots.actives,
      }),
      enqueueLocalWinsReconcileItems({
        entityType: "img",
        localRows: localImgs,
        remoteRows: remoteSnapshots.imgs,
      }),
    ]);

    appendSyncRuntimeLog(
      `手动对账入队：分类 ${categoryQueued} 项，功能 ${activeQueued} 项，图片 ${imgQueued} 项。`,
    );
  }

  const queue = sortQueue(
    await listSyncQueue(["pending", "failed"]),
    localCategories,
  );
  appendSyncRuntimeLog(`待处理队列项：${queue.length}`);
  const results: Array<{
    id: number | string;
    entity_type: string;
    entity_id: number | string;
    operation: string;
    success: boolean;
    error?: string;
  }> = [];

  for (const item of queue) {
    if (isSyncPauseRequested()) {
      appendSyncRuntimeLog("同步已暂停：剩余队列保留待下次继续。");
      break;
    }

    const marked = await markOutboxSyncing(item.id);

    if (!marked) {
      continue;
    }

    try {
      await processQueueItem(item);
      await markOutboxSynced(item.id);
      const entry = {
        id: item.id,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        operation: item.operation,
        success: true,
      } as const;
      results.push(entry);
      appendSyncRuntimeLog(formatSyncResultLogEntry(entry));
    } catch (error) {
      const message = error instanceof Error ? error.message : "同步失败。";
      await markOutboxFailed(item.id, message);
      const entry = {
        id: item.id,
        entity_type: item.entity_type,
        entity_id: item.entity_id,
        operation: item.operation,
        success: false,
        error: message,
      } as const;
      results.push(entry);
      appendSyncRuntimeLog(formatSyncResultLogEntry(entry));
    }

    updateSyncRuntimeProcessed(results.length);

    if (isSyncPauseRequested()) {
      appendSyncRuntimeLog("当前处理项已完成，准备暂停同步。");
      break;
    }
  }

  const paused = isSyncPauseRequested();

  if (!paused && results.every((entry) => entry.success)) {
    const deleteResults = await syncQueuedCategoryImageDeletes();
    deleteResults.forEach((entry) => {
      appendSyncRuntimeLog(formatSyncResultLogEntry(entry));
    });
    results.push(...deleteResults);
    updateSyncRuntimeProcessed(results.length);
  }

  if (!paused && results.every((entry) => entry.success)) {
    try {
      const latestCategories = await listRawCategories();
      const latestImgs = await listRawImgs();
      const stats = await syncHomepagePrintableStats({
        categories: latestCategories,
        imgs: latestImgs,
      });
      const entry = {
        id: "homepage-printable-stats",
        entity_type: "homepage",
        entity_id: "printable_stats",
        operation: "update",
        success: true,
      } as const;
      results.push(entry);
      appendSyncRuntimeLog(
        `OK | homepage | printable_stats | update | total=${stats.total_printable_count}`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "同步首页素材统计失败。";
      const entry = {
        id: "homepage-printable-stats",
        entity_type: "homepage",
        entity_id: "printable_stats",
        operation: "update",
        success: false,
        error: message,
      } as const;
      results.push(entry);
      appendSyncRuntimeLog(formatSyncResultLogEntry(entry));
    }
    updateSyncRuntimeProcessed(results.length);
  }

  const finalResult = {
    summary: await getSyncSummary(),
    processed_count: results.length,
    success_count: results.filter((entry) => entry.success).length,
    failure_count: results.filter((entry) => !entry.success).length,
    results,
    failed_items: (await listSyncQueue(["failed"])).map(mapQueueIssue),
  } satisfies SyncRunResult;

  if (!paused && finalResult.success_count > 0) {
    appendSyncRuntimeLog("开始通知前台刷新 ISR 缓存状态...");
    try {
      const revalidated = await notifyFrontendRevalidate();
      appendSyncRuntimeLog(
        `已通知前台 revalidate：endpoint=${revalidated.endpoint}，status=${revalidated.status}。`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "通知前台 revalidate 失败。";
      appendSyncRuntimeLog(`WARN | frontend | revalidate | ${message}`);
    }
  }

  appendSyncRuntimeLog(
    `完成：成功 ${finalResult.success_count} 项，失败 ${finalResult.failure_count} 项。`,
  );

  return {
    finalResult,
    paused,
  };
}

export async function runSync() {
  const owner = randomUUID();
  const { acquired } = await acquireSyncLockForNewRun(owner);

  if (!acquired) {
    throw new Error("同步正在执行中，请稍后重试。");
  }

  try {
    await cleanupOrphanedStagedFiles();
    return (await runSyncInternal()).finalResult;
  } finally {
    await releaseSyncRuntimeLock(owner);
  }
}

export async function startSync() {
  const currentRuntime = getSyncRuntimeSnapshot();
  if (currentRuntime.status === "running") {
    return {
      started: false,
      already_running: true,
      sync_run: currentRuntime,
      summary: await getSyncSummary(),
    };
  }

  const owner = randomUUID();
  const { acquired, recovered } = await acquireSyncLockForNewRun(owner);

  if (!acquired) {
    return {
      started: false,
      already_running: true,
      sync_run: getSyncRuntimeSnapshot(),
      summary: await getSyncSummary(),
    };
  }

  const estimatedTotal = await estimateSyncTotalCount();
  startSyncRuntime(owner, estimatedTotal, "开始同步...");
  if (recovered && (recovered.released_locks > 0 || recovered.reset_outbox_items > 0)) {
    appendSyncRuntimeLog(
      `已恢复上次中断的同步状态：释放锁 ${recovered.released_locks} 个，恢复队列 ${recovered.reset_outbox_items} 项。`,
    );
  }
  void (async () => {
    try {
      await cleanupOrphanedStagedFiles();
      const { finalResult, paused } = await runSyncInternal();
      finishSyncRuntime(paused ? "paused" : "completed", finalResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : "执行同步失败。";
      appendSyncRuntimeLog(`FAILED | sync | run | ${message}`);
      finishSyncRuntime("failed", null, message);
    } finally {
      await releaseSyncRuntimeLock(owner);
    }
  })();

  return {
    started: true,
    already_running: false,
    sync_run: getSyncRuntimeSnapshot(),
    summary: await getSyncSummary(),
  };
}

export async function startManualSync() {
  const currentRuntime = getSyncRuntimeSnapshot();
  if (currentRuntime.status === "running") {
    return {
      started: false,
      already_running: true,
      sync_run: currentRuntime,
      summary: await getSyncSummary(),
    };
  }

  const owner = randomUUID();
  const { acquired, recovered } = await acquireSyncLockForNewRun(owner);

  if (!acquired) {
    return {
      started: false,
      already_running: true,
      sync_run: getSyncRuntimeSnapshot(),
      summary: await getSyncSummary(),
    };
  }

  const estimatedTotal = await estimateSyncTotalCount({ reconcileRemote: true });
  startSyncRuntime(
    owner,
    estimatedTotal,
    "开始手动同步：拉取远端快照并按本地优先对账...",
  );
  if (recovered && (recovered.released_locks > 0 || recovered.reset_outbox_items > 0)) {
    appendSyncRuntimeLog(
      `已恢复上次中断的同步状态：释放锁 ${recovered.released_locks} 个，恢复队列 ${recovered.reset_outbox_items} 项。`,
    );
  }
  void (async () => {
    try {
      await cleanupOrphanedStagedFiles();
      const { finalResult, paused } = await runSyncInternal({
        reconcileRemote: true,
      });
      finishSyncRuntime(paused ? "paused" : "completed", finalResult);
    } catch (error) {
      const message = error instanceof Error ? error.message : "执行手动同步失败。";
      appendSyncRuntimeLog(`FAILED | sync | manual | ${message}`);
      finishSyncRuntime("failed", null, message);
    } finally {
      await releaseSyncRuntimeLock(owner);
    }
  })();

  return {
    started: true,
    already_running: false,
    sync_run: getSyncRuntimeSnapshot(),
    summary: await getSyncSummary(),
  };
}

export async function retryFailedAndRunSync() {
  const owner = randomUUID();
  const { acquired } = await acquireSyncLockForNewRun(owner);

  if (!acquired) {
    throw new Error("同步正在执行中，请稍后重试。");
  }

  try {
    await retryFailedOutbox();
    await cleanupOrphanedStagedFiles();
    return (await runSyncInternal()).finalResult;
  } finally {
    await releaseSyncRuntimeLock(owner);
  }
}
