import Database from "better-sqlite3";
import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function monorepoRoot() {
  return path.resolve(process.cwd(), "../..");
}

function registryPath() {
  return path.join(monorepoRoot(), ".local/publisher.sqlite");
}

export type SitePageRecord = {
  id: number;
  url: string;
  r2_key: string;
  page_type: string;
  status: string;
  dirty_reason: string | null;
  last_error: string | null;
  built_at: string | null;
  published_at: string | null;
  updated_at: string;
};

export async function getLocalPageRegistry(options?: {
  status?: string;
  pageType?: string;
  query?: string;
  limit?: number;
  offset?: number;
}) {
  try {
    await access(registryPath());
  } catch {
    return { initialized: false, total: 0, rows: [], byStatus: [], byType: [] };
  }

  const db = new Database(registryPath(), { readonly: true, fileMustExist: true });
  try {
    const where: string[] = ["status != 'removed'"];
    const params: Record<string, string | number> = {};
    if (options?.status) {
      where.push("status = @status");
      params.status = options.status;
    }
    if (options?.pageType) {
      where.push("page_type = @pageType");
      params.pageType = options.pageType;
    }
    if (options?.query) {
      where.push("(url LIKE @query OR r2_key LIKE @query)");
      params.query = `%${options.query}%`;
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);
    const offset = Math.max(options?.offset ?? 0, 0);
    const rows = db.prepare(`
      SELECT id,url,r2_key,page_type,status,dirty_reason,last_error,built_at,published_at,updated_at
      FROM site_urls ${clause}
      ORDER BY CASE status WHEN 'failed' THEN 0 WHEN 'dirty' THEN 1 WHEN 'built' THEN 2 ELSE 3 END, url
      LIMIT @limit OFFSET @offset
    `).all({ ...params, limit, offset }) as SitePageRecord[];
    const total = (db.prepare(`SELECT COUNT(*) AS count FROM site_urls ${clause}`).get(params) as { count: number }).count;
    const byStatus = db.prepare("SELECT status,COUNT(*) AS count FROM site_urls WHERE status != 'removed' GROUP BY status ORDER BY status").all();
    const byType = db.prepare("SELECT page_type,COUNT(*) AS count FROM site_urls WHERE status != 'removed' GROUP BY page_type ORDER BY page_type").all();
    return { initialized: true, total, rows, byStatus, byType };
  } finally {
    db.close();
  }
}

export async function runLocalPublisher(
  action: "scan" | "build" | "publish-local" | "rebuild",
  options?: { scope?: string; limit?: number; origin?: string },
) {
  const cli = path.join(monorepoRoot(), "packages/publisher/src/cli.mjs");
  const args = [cli, action];
  if (options?.scope) args.push("--scope", options.scope);
  if (options?.limit) args.push("--limit", String(options.limit));
  if (options?.origin) args.push("--origin", options.origin);
  const { stdout, stderr } = await execFileAsync(process.execPath, args, {
    cwd: monorepoRoot(),
    env: { ...process.env, PRINTLY_LOCAL_ONLY: "1" },
    maxBuffer: 10 * 1024 * 1024,
  });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}
