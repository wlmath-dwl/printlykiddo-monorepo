#!/usr/bin/env node

import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  copyReleaseBase,
  createReleaseManifest,
  defaultReleaseId,
  parseOptions,
  releaseObjectsRoot,
  releaseRoot,
  safeReleaseId,
  writeLocalReleasePointer,
  ROOT,
} from "./release-utils.mjs";
import { validateRelease } from "./validate.mjs";

const SITE_ROOT = path.join(ROOT, "apps/site-legacy");
const REGISTRY_PATH = path.join(ROOT, ".local/publisher.sqlite");
const PUBLISHER_CLI = path.join(ROOT, "packages/publisher/src/cli.mjs");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

function publisher(command, environment, args = []) {
  return run(process.execPath, [PUBLISHER_CLI, command, ...args], {
    cwd: ROOT,
    env: { ...process.env, ...environment, PRINTLY_LOCAL_ONLY: "1" },
  });
}

function countPending() {
  const db = new DatabaseSync(REGISTRY_PATH, { readOnly: true });
  try {
    return Number(db.prepare("SELECT COUNT(*) AS count FROM site_urls WHERE status IN ('dirty','failed') AND status NOT IN ('deleted','removed')").get().count);
  } finally {
    db.close();
  }
}

async function waitForServer(origin, child) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`production renderer exited with ${child.exitCode}`);
    try {
      const response = await fetch(origin, { redirect: "manual" });
      if (response.status > 0) return;
    } catch {
      // The server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`production renderer did not start at ${origin}`);
}

async function fetchGeneratedAsset(origin, pathname, destination) {
  const response = await fetch(`${origin}${pathname}`);
  if (!response.ok) throw new Error(`${pathname} returned ${response.status}`);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

function staticPdfTopicPaths() {
  const db = new DatabaseSync(REGISTRY_PATH, { readOnly: true });
  try {
    return db.prepare(`
      SELECT url
      FROM site_urls
      WHERE page_type = 'category'
        AND status NOT IN ('deleted', 'removed')
      ORDER BY url
    `).all()
      .map((row) => String(row.url).replace(/^\/+|\/+$/g, ""))
      .filter((url) => url.split("/").length >= 3);
  } finally {
    db.close();
  }
}

async function fetchStaticPdfTopics(origin, objectsRoot) {
  const paths = staticPdfTopicPaths();
  for (const categoryPath of paths) {
    const response = await fetch(`${origin}/api/pdf-topics?path=${encodeURIComponent(categoryPath)}`);
    if (!response.ok) throw new Error(`/api/pdf-topics for ${categoryPath} returned ${response.status}`);
    const destination = path.join(objectsRoot, "data/pdf-topics", `${categoryPath}.json`);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, Buffer.from(await response.arrayBuffer()));
  }
  return paths.length;
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  const releaseId = safeReleaseId(options.get("release") || defaultReleaseId());
  const port = Number(options.get("port") || 3100);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("--port must be between 1024 and 65535");
  const origin = `http://127.0.0.1:${port}`;
  const releaseDir = releaseRoot(releaseId);
  const objectsRoot = releaseObjectsRoot(releaseId);
  const buildRoot = path.join(releaseDir, "build");
  await mkdir(objectsRoot, { recursive: true });
  const baseRelease = await copyReleaseBase(objectsRoot);
  const environment = {
    PRINTLY_BUILD_ROOT: buildRoot,
    PRINTLY_LOCAL_R2_ROOT: objectsRoot,
    PRINTLY_INITIAL_PRODUCTION_RELEASE: baseRelease ? "0" : "1",
  };

  await publisher("scan", environment);
  if (!baseRelease) await publisher("rebuild", environment, ["--scope", "all"]);
  const pending = countPending();
  if (!pending && !options.has("force")) {
    console.log(JSON.stringify({ ok: true, skipped: true, reason: "no dirty URLs", release_id: releaseId }, null, 2));
    return;
  }

  const rendererEnv = {
    ...process.env,
    PRINTLY_STATIC_RENDER: "1",
    NEXT_PUBLIC_IMAGE_PROXY_BASE_URL: "https://img.printlykiddo.com",
    NODE_ENV: "production",
  };
  await run("npm", ["run", "build"], { cwd: SITE_ROOT, env: rendererEnv });

  const nextBin = path.join(SITE_ROOT, "node_modules/next/dist/bin/next");
  const server = spawn(process.execPath, [nextBin, "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: SITE_ROOT,
    env: rendererEnv,
    stdio: ["ignore", "inherit", "inherit"],
  });
  try {
    await waitForServer(origin, server);
    await publisher("build", environment, ["--origin", origin, "--quiet"]);
    await publisher("publish-local", environment);
    await fetchGeneratedAsset(origin, "/robots.txt", path.join(objectsRoot, "robots.txt"));
    await fetchGeneratedAsset(origin, "/sitemap.xml", path.join(objectsRoot, "sitemap.xml"));
    await fetchGeneratedAsset(origin, "/icon.svg", path.join(objectsRoot, "icon.svg"));
    await fetchGeneratedAsset(origin, "/apple-icon", path.join(objectsRoot, "apple-icon"));
    await fetchGeneratedAsset(origin, "/opengraph-image", path.join(objectsRoot, "opengraph-image"));
    await fetchGeneratedAsset(origin, "/twitter-image", path.join(objectsRoot, "twitter-image"));
    await fetchStaticPdfTopics(origin, objectsRoot);
  } finally {
    if (server.exitCode == null) server.kill("SIGTERM");
  }

  const { manifest, manifestHash } = await createReleaseManifest({ releaseId, objectsRoot });
  const validation = await validateRelease(releaseId);
  if (!validation.ok) {
    console.error(JSON.stringify(validation, null, 2));
    throw new Error(`release ${releaseId} failed local validation`);
  }
  await writeLocalReleasePointer(releaseId, {
    urls_checked: validation.urls_checked,
    objects_checked: validation.objects_checked,
  });
  const summary = {
    ok: true,
    release_id: releaseId,
    based_on: baseRelease,
    dirty_urls_rendered: pending,
    url_count: manifest.url_count,
    object_count: manifest.object_count,
    manifest_sha256: manifestHash,
    release_root: releaseDir,
  };
  await writeFile(path.join(releaseDir, "build-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
}

await main();
