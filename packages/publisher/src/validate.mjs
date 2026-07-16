#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { sha256 } from "../../shared/src/hash.mjs";
import {
  parseOptions,
  readJson,
  releaseObjectsRoot,
  releaseRoot,
  safeReleaseId,
} from "./release-utils.mjs";

const FORBIDDEN_PRODUCTION_PATTERNS = [
  ["localhost reference", /(?:https?:\/\/)?(?:localhost|127\.0\.0\.1)(?::\d+)?/i],
  ["local image API", /\/api\/local-dev\/image/i],
  ["Next development runtime", /\/_next\/static\/development\//i],
  ["webpack hot update", /hot-update\.(?:js|json)/i],
];

const EXTENSIONLESS_STATIC_PATHS = new Set(["/apple-icon", "/opengraph-image", "/twitter-image"]);

function extractAttributeValues(html, attribute) {
  const expression = new RegExp(`${attribute}=["']([^"']+)["']`, "gi");
  return [...html.matchAll(expression)].map((match) => match[1]);
}

function isLocalStaticReference(value) {
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  const pathname = value.split(/[?#]/, 1)[0];
  return pathname.startsWith("/_next/")
    || EXTENSIONLESS_STATIC_PATHS.has(pathname)
    || /\.[a-z0-9]{2,8}$/i.test(pathname);
}

function staticKey(value) {
  const key = value.split(/[?#]/, 1)[0].replace(/^\/+/, "");
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

function checkSeo(html, url, errors) {
  if (!/<title>[^<]{3,}<\/title>/i.test(html)) errors.push(`${url}: missing or empty title`);
  if (!/<h1[\s>][\s\S]*?<\/h1>/i.test(html)) errors.push(`${url}: missing h1`);
  const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  if (!canonical) errors.push(`${url}: missing canonical`);
  else if (!canonical[1].startsWith("https://printlykiddo.com")) errors.push(`${url}: canonical is not the production origin`);
}

export async function validateRelease(releaseId, { writeReport = true } = {}) {
  const id = safeReleaseId(releaseId);
  const objectsRoot = releaseObjectsRoot(id);
  const manifest = await readJson(path.join(objectsRoot, "data/release-manifest.json"));
  const objectByKey = new Map(manifest.objects.map((entry) => [entry.key, entry]));
  const errors = [];
  const warnings = [];
  const referencedAssets = new Set();

  if (manifest.renderer !== "next-production") errors.push(`renderer must be next-production, got ${manifest.renderer}`);
  if (manifest.url_count !== manifest.urls.length) errors.push("url_count does not match urls length");
  if (manifest.object_count !== manifest.objects.length) errors.push("object_count does not match objects length");

  for (const object of manifest.objects) {
    const file = path.join(objectsRoot, object.key);
    try {
      const body = await readFile(file);
      if (body.length !== object.size) errors.push(`${object.key}: size mismatch`);
      if (sha256(body) !== object.sha256) errors.push(`${object.key}: sha256 mismatch`);
    } catch (error) {
      errors.push(`${object.key}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (/\/_next\/static\/development\/|hot-update\.(?:js|json)$/i.test(`/${object.key}`)) {
      errors.push(`${object.key}: development artifact is forbidden`);
    }
  }

  for (const page of manifest.urls) {
    const file = path.join(objectsRoot, page.r2_key);
    let html;
    try {
      html = await readFile(file, "utf8");
    } catch (error) {
      errors.push(`${page.url}: page object missing (${page.r2_key})`);
      continue;
    }
    if (sha256(html) !== page.sha256) errors.push(`${page.url}: page hash does not match URL manifest`);
    if (!/<html[\s>]/i.test(html) || !/<\/html>/i.test(html)) errors.push(`${page.url}: incomplete HTML document`);
    for (const [label, pattern] of FORBIDDEN_PRODUCTION_PATTERNS) {
      if (pattern.test(html)) errors.push(`${page.url}: contains ${label}`);
    }
    checkSeo(html, page.url, errors);
    for (const value of [...extractAttributeValues(html, "src"), ...extractAttributeValues(html, "href")]) {
      if (isLocalStaticReference(value)) referencedAssets.add(staticKey(value));
    }
    if (page.page_type?.endsWith("root") && !html.includes("/_next/static/")) {
      warnings.push(`${page.url}: interactive tool page has no Next client asset reference`);
    }
  }

  for (const key of referencedAssets) {
    if (!objectByKey.has(key)) errors.push(`referenced static object is missing: ${key}`);
  }
  for (const required of [
    "robots.txt",
    "sitemap.xml",
    "apple-icon",
    "opengraph-image",
    "twitter-image",
    "data/redirects.json",
    "data/url-manifest.json",
  ]) {
    if (!objectByKey.has(required)) errors.push(`required object is missing: ${required}`);
  }

  const report = {
    ok: errors.length === 0,
    release_id: id,
    checked_at: new Date().toISOString(),
    urls_checked: manifest.urls.length,
    objects_checked: manifest.objects.length,
    static_references_checked: referencedAssets.size,
    errors,
    warnings,
  };
  if (writeReport) {
    await mkdir(releaseRoot(id), { recursive: true });
    await writeFile(path.join(releaseRoot(id), "validation-local.json"), `${JSON.stringify(report, null, 2)}\n`);
  }
  return report;
}

async function mapConcurrent(values, concurrency, task) {
  const queue = [...values];
  const results = [];
  const workers = Array.from({ length: Math.min(concurrency, queue.length || 1) }, async () => {
    while (queue.length) {
      const value = queue.shift();
      results.push(await task(value));
    }
  });
  await Promise.all(workers);
  return results;
}

export async function validateOrigin(releaseId, origin, { expectNoindex = false, concurrency = 12, maxImages = 500 } = {}) {
  const id = safeReleaseId(releaseId);
  const base = new URL(origin);
  const manifest = await readJson(path.join(releaseObjectsRoot(id), "data/release-manifest.json"));
  const errors = [];
  const warnings = [];
  const assets = new Set();
  const imageUrls = new Set();

  await mapConcurrent(manifest.urls, concurrency, async (page) => {
    try {
      const response = await fetch(new URL(page.url, base), {
        redirect: "manual",
        headers: { Accept: "text/html" },
        signal: AbortSignal.timeout(15_000),
      });
      if (response.status !== 200) {
        errors.push(`${page.url}: expected 200, got ${response.status}`);
        return;
      }
      if (expectNoindex && !/noindex/i.test(response.headers.get("x-robots-tag") || "")) {
        errors.push(`${page.url}: staging response is missing X-Robots-Tag noindex`);
      }
      const body = Buffer.from(await response.arrayBuffer());
      if (sha256(body) !== page.sha256) errors.push(`${page.url}: served body hash differs from release`);
      const html = body.toString("utf8");
      for (const [label, pattern] of FORBIDDEN_PRODUCTION_PATTERNS) {
        if (pattern.test(html)) errors.push(`${page.url}: served HTML contains ${label}`);
      }
      checkSeo(html, page.url, errors);
      const srcValues = extractAttributeValues(html, "src");
      const hrefValues = extractAttributeValues(html, "href");
      for (const value of [...srcValues, ...hrefValues]) {
        try {
          const resource = new URL(value, base);
          if (resource.hostname === base.hostname && isLocalStaticReference(resource.pathname)) assets.add(resource.href);
        } catch {
          warnings.push(`${page.url}: invalid resource URL ${value}`);
        }
      }
      for (const value of srcValues) {
        try {
          const resource = new URL(value, base);
          if (resource.hostname !== "img.printlykiddo.com") continue;
          if (!resource.pathname.startsWith("/imgs/")) errors.push(`${page.url}: invalid image CDN path ${resource.pathname}`);
          else imageUrls.add(resource.href);
        } catch {
          // The general resource pass already reports malformed URLs.
        }
      }
    } catch (error) {
      errors.push(`${page.url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  const sampledImages = [...imageUrls]
    .sort((left, right) => sha256(left).localeCompare(sha256(right)))
    .slice(0, maxImages > 0 ? maxImages : imageUrls.size);
  await mapConcurrent([...assets, ...sampledImages], concurrency, async (resource) => {
    try {
      const response = await fetch(resource, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) errors.push(`${resource}: resource returned ${response.status}`);
    } catch (error) {
      errors.push(`${resource}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  const releaseResponse = await fetch(new URL("/.well-known/printly-release", base), {
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!releaseResponse.ok) errors.push(`release endpoint returned ${releaseResponse.status}`);
  else {
    const remoteManifest = await releaseResponse.json();
    if (remoteManifest.release_id !== id) errors.push(`release endpoint reports ${remoteManifest.release_id}, expected ${id}`);
  }

  const report = {
    ok: errors.length === 0,
    release_id: id,
    origin: base.origin,
    checked_at: new Date().toISOString(),
    urls_checked: manifest.urls.length,
    assets_checked: assets.size,
    image_urls_validated: imageUrls.size,
    images_http_checked: sampledImages.length,
    errors,
    warnings,
  };
  await writeFile(path.join(releaseRoot(id), `validation-${base.hostname}.json`), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function main() {
  const command = process.argv[2] || "release";
  const options = parseOptions();
  const releaseId = options.get("release");
  if (!releaseId) throw new Error("--release is required");
  const report = command === "origin"
    ? await validateOrigin(releaseId, options.get("origin"), {
      expectNoindex: options.has("expect-noindex"),
      concurrency: Number(options.get("concurrency") || 12),
      maxImages: Number(options.get("max-images") || 500),
    })
    : await validateRelease(releaseId);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
