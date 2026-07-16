import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { hashFile, sha256 } from "../../shared/src/hash.mjs";

export const ROOT = path.resolve(import.meta.dirname, "../../..");
export const LOCAL_ROOT = path.join(ROOT, ".local");
export const RELEASES_ROOT = path.join(LOCAL_ROOT, "releases");
export const REMOTE_STATE_ROOT = path.join(LOCAL_ROOT, "remote-state");

export function parseOptions(argv = process.argv.slice(3)) {
  const result = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    const equals = value.indexOf("=");
    if (equals >= 0) {
      result.set(value.slice(2, equals), value.slice(equals + 1));
      continue;
    }
    const name = value.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      result.set(name, next);
      index += 1;
    } else {
      result.set(name, true);
    }
  }
  return result;
}

export function safeReleaseId(input) {
  const value = String(input || "").trim();
  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/i.test(value)) {
    throw new Error(`Invalid release id: ${input}`);
  }
  return value;
}

export function defaultReleaseId() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").toLowerCase();
}

export function releaseRoot(releaseId) {
  return path.join(RELEASES_ROOT, safeReleaseId(releaseId));
}

export function releaseObjectsRoot(releaseId) {
  return path.join(releaseRoot(releaseId), "objects");
}

export async function readJson(file) {
  return JSON.parse(await readFile(file, "utf8"));
}

export async function readJsonIfPresent(file, fallback = null) {
  try {
    return await readJson(file);
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
}

export async function walkFiles(root, relative = "") {
  const directory = path.join(root, relative);
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(root, next));
    else files.push(next.split(path.sep).join("/"));
  }
  return files;
}

export function contentTypeForKey(key) {
  if (["apple-icon", "opengraph-image", "twitter-image"].includes(key)) return "image/png";
  const extension = path.extname(key).toLowerCase();
  return ({
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".xml": "application/xml; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".pdf": "application/pdf",
  })[extension] || "application/octet-stream";
}

export function cacheControlForKey(key) {
  if (key.startsWith("_next/static/")) return "public, max-age=31536000, immutable";
  if (key.startsWith("pages/")) return "public, max-age=0, s-maxage=31536000";
  if (key === "robots.txt" || key === "sitemap.xml") return "public, max-age=300, s-maxage=3600";
  if (key.startsWith("data/pdf-topics/")) return "public, max-age=300, s-maxage=86400";
  if (key.startsWith("data/")) return "no-store";
  return "public, max-age=300, s-maxage=86400";
}

export async function describeObject(root, key) {
  const file = path.join(root, key);
  const details = await stat(file);
  return {
    key,
    sha256: await hashFile(file),
    size: details.size,
    content_type: contentTypeForKey(key),
    cache_control: cacheControlForKey(key),
  };
}

export async function createReleaseManifest({ releaseId, objectsRoot, renderer = "next-production" }) {
  const urlInventory = await readJson(path.join(objectsRoot, "data/url-manifest.json"));
  const redirectInventory = await readJsonIfPresent(path.join(objectsRoot, "data/redirects.json"), { redirects: [] });
  const invalidation = await readJsonIfPresent(path.join(objectsRoot, "data/cache-invalidation.json"), { urls: [] });
  const keys = (await walkFiles(objectsRoot))
    .filter((key) => key !== "data/release-manifest.json")
    .sort();
  const objects = [];
  for (const key of keys) objects.push(await describeObject(objectsRoot, key));
  const urls = (urlInventory.urls ?? []).map((entry) => ({
    url: entry.url,
    r2_key: entry.r2_key,
    page_type: entry.page_type,
    sha256: entry.published_hash,
  }));
  const manifest = {
    schema_version: 1,
    release_id: safeReleaseId(releaseId),
    generated_at: new Date().toISOString(),
    renderer,
    canonical_origin: "https://printlykiddo.com",
    url_count: urls.length,
    redirect_count: redirectInventory.redirects?.length ?? 0,
    object_count: objects.length,
    invalidation_urls: [...new Set(invalidation.urls ?? [])].sort(),
    urls,
    redirects: redirectInventory.redirects ?? [],
    objects,
  };
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(path.join(objectsRoot, "data/release-manifest.json"), serialized);
  await writeFile(path.join(path.dirname(objectsRoot), "release-manifest.json"), serialized);
  return { manifest, manifestHash: sha256(serialized) };
}

export async function copyReleaseBase(destinationRoot) {
  const pointer = await readJsonIfPresent(path.join(RELEASES_ROOT, "current-local.json"));
  if (!pointer?.release_id) return null;
  const sourceRoot = releaseObjectsRoot(pointer.release_id);
  await cp(sourceRoot, destinationRoot, { recursive: true, force: true });
  return pointer.release_id;
}

export async function writeLocalReleasePointer(releaseId, validation) {
  await mkdir(RELEASES_ROOT, { recursive: true });
  await writeFile(path.join(RELEASES_ROOT, "current-local.json"), `${JSON.stringify({
    release_id: safeReleaseId(releaseId),
    validated_at: new Date().toISOString(),
    validation,
  }, null, 2)}\n`);
}
