import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const projectRoot = process.cwd();
const DEFAULT_LOCAL_SQLITE_PATH = "../admin/data/local-admin.sqlite";
const localDbPath = path.resolve(
  projectRoot,
  process.env.LOCAL_SQLITE_PATH?.trim() || DEFAULT_LOCAL_SQLITE_PATH,
);
const localDbDir = path.dirname(localDbPath);
const sqlExportPath = path.join(localDbDir, "kid-print.remote.sql");

mkdirSync(localDbDir, { recursive: true });

const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const exportResult = spawnSync(
  npxCommand,
  ["wrangler", "d1", "export", "kid-print", "--remote", "--output", sqlExportPath],
  {
    cwd: projectRoot,
    stdio: "inherit",
  },
);

if (exportResult.status !== 0) {
  process.exit(exportResult.status ?? 1);
}

if (!existsSync(sqlExportPath)) {
  throw new Error(`Export file was not created: ${sqlExportPath}`);
}

rmSync(localDbPath, { force: true });

const sql = readFileSync(sqlExportPath, "utf8");
const database = new DatabaseSync(localDbPath);

try {
  database.exec(sql);
} finally {
  database.close();
  unlinkSync(sqlExportPath);
}

console.log(`Local sqlite database updated: ${localDbPath}`);
