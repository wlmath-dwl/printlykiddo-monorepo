#!/usr/bin/env node

import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { hashFile } from "../../shared/src/hash.mjs";
import {
  REMOTE_STATE_ROOT,
  ROOT,
  contentTypeForKey,
  cacheControlForKey,
  describeObject,
  parseOptions,
  readJson,
  readJsonIfPresent,
  releaseObjectsRoot,
  releaseRoot,
  safeReleaseId,
} from "./release-utils.mjs";

const ENVIRONMENTS = {
  local: {
    bucket: "printlykiddo-pages-local",
    origin: "http://127.0.0.1:8787",
    remote: false,
  },
  staging: {
    bucket: "printlykiddo-pages-staging",
    origin: "https://preview.printlykiddo.com",
    remote: true,
  },
  production: {
    bucket: "printlykiddo-pages-production",
    origin: "https://printlykiddo.com",
    remote: true,
  },
};

async function wranglerBin() {
  const candidates = [
    process.env.PRINTLY_WRANGLER_BIN,
    path.join(ROOT, "apps/site-worker/node_modules/.bin/wrangler"),
    path.join(ROOT, "apps/image-worker/node_modules/.bin/wrangler"),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Continue to the next local Wrangler installation.
    }
  }
  throw new Error("Wrangler was not found. Run npm install before using R2 commands.");
}

function run(command, args, { capture = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: ROOT, stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
    let stdout = "";
    let stderr = "";
    if (capture) {
      child.stdout.on("data", (chunk) => { stdout += chunk; });
      child.stderr.on("data", (chunk) => { stderr += chunk; });
    }
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with ${code ?? signal}${stderr ? `: ${stderr.trim()}` : ""}`));
    });
  });
}

async function mapConcurrent(values, concurrency, task) {
  const queue = [...values];
  const workers = Array.from({ length: Math.min(concurrency, queue.length || 1) }, async () => {
    while (queue.length) await task(queue.shift());
  });
  await Promise.all(workers);
}

async function retry(task, { attempts = 4, label = "remote operation" } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      const delay = 500 * (2 ** (attempt - 1));
      console.warn(`${label} failed (attempt ${attempt}/${attempts}); retrying in ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

function environmentConfig(name) {
  const config = ENVIRONMENTS[name];
  if (!config) throw new Error(`--environment must be one of ${Object.keys(ENVIRONMENTS).join(", ")}`);
  return config;
}

function remoteObjectKey(key) {
  return key.split("/").map((segment) => {
    const match = segment.match(/^\[(\.\.\.)?([^\]]+)\]$/);
    if (!match) return segment;
    return `__next-${match[1] ? "catchall" : "param"}-${match[2]}__`;
  }).join("/");
}

function statePath(environment) {
  return path.join(REMOTE_STATE_ROOT, `${environment}.json`);
}

async function releaseInventory(releaseId) {
  const objectsRoot = releaseObjectsRoot(releaseId);
  const manifest = await readJson(path.join(objectsRoot, "data/release-manifest.json"));
  const manifestObject = await describeObject(objectsRoot, "data/release-manifest.json");
  return { objectsRoot, manifest, objects: [...manifest.objects, manifestObject] };
}

async function createPlan(environment, releaseId) {
  const id = safeReleaseId(releaseId);
  const config = environmentConfig(environment);
  const inventory = await releaseInventory(id);
  const prior = await readJsonIfPresent(statePath(environment), { objects: [] });
  const priorByKey = new Map((prior.objects ?? []).map((entry) => [entry.key, entry]));
  const nextByKey = new Map(inventory.objects.map((entry) => [entry.key, entry]));
  const toUpload = inventory.objects.filter((entry) => priorByKey.get(entry.key)?.sha256 !== entry.sha256);
  const toRemove = (prior.objects ?? []).filter((entry) => !nextByKey.has(entry.key));
  const invalidationUrls = prior.release_id
    ? inventory.manifest.invalidation_urls ?? []
    : inventory.manifest.urls.map((entry) => entry.url);
  const plan = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    environment,
    bucket: config.bucket,
    release_id: id,
    prior_release_id: prior.release_id ?? null,
    total_objects: inventory.objects.length,
    unchanged_objects: inventory.objects.length - toUpload.length,
    to_upload: toUpload,
    to_remove: toRemove,
    invalidation_urls: [...new Set(invalidationUrls)].sort(),
    safety: {
      remote_write_executed: false,
      deletes_enabled: false,
      routes_changed: false,
    },
  };
  await mkdir(releaseRoot(id), { recursive: true });
  await writeFile(path.join(releaseRoot(id), `upload-plan-${environment}.json`), `${JSON.stringify(plan, null, 2)}\n`);
  return { plan, inventory, config };
}

function assertRemoteWriteAllowed(environment, releaseId, options) {
  if (!options.has("execute")) throw new Error("Remote writes are disabled without --execute");
  const expected = `ALLOW_PRINTLY_${environment.toUpperCase()}_WRITE`;
  if (process.env.PRINTLY_REMOTE_WRITE_ACK !== expected) {
    throw new Error(`Set PRINTLY_REMOTE_WRITE_ACK=${expected} for this one command`);
  }
  if (environment === "production" && options.get("confirm-release") !== releaseId) {
    throw new Error(`Production requires --confirm-release ${releaseId}`);
  }
}

async function assertRemoteManifestMatches(environment, config, expectedPriorRelease, options) {
  if (!config.remote) return;
  const bin = await wranglerBin();
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), `printly-${environment}-drift-`));
  const destination = path.join(temporaryRoot, "release-manifest.json");
  try {
    await run(bin, [
      "r2", "object", "get", `${config.bucket}/data/release-manifest.json`,
      "--remote", "--file", destination,
    ], { capture: true });
  } catch (error) {
    if (!expectedPriorRelease && options.has("confirm-empty-bucket")) return;
    throw new Error(`Cannot verify current ${environment} release before writing: ${error instanceof Error ? error.message : String(error)}`);
  }
  const remote = await readJson(destination);
  if ((remote.release_id ?? null) !== (expectedPriorRelease ?? null)) {
    throw new Error(`Remote ${environment} release drifted: expected ${expectedPriorRelease ?? "empty"}, found ${remote.release_id ?? "unknown"}`);
  }
}

function putArgs(config, object, file, localPersistRoot) {
  const storageKey = config.remote ? remoteObjectKey(object.key) : object.key;
  const args = [
    "r2", "object", "put", `${config.bucket}/${storageKey}`,
    "--file", file,
    "--content-type", object.content_type || contentTypeForKey(object.key),
    "--cache-control", object.cache_control || cacheControlForKey(object.key),
  ];
  if (config.remote) args.push("--remote");
  else args.push("--local", "--persist-to", localPersistRoot);
  return args;
}

async function uploadPlan(plan, inventory, config, options) {
  const bin = await wranglerBin();
  const concurrency = Math.max(1, Math.min(Number(options.get("concurrency") || 4), 12));
  if (plan.to_remove.length && !options.has("allow-delete")) {
    throw new Error(`${plan.to_remove.length} stale objects require review; rerun with --allow-delete only after confirming the plan`);
  }
  if (plan.to_remove.length) {
    throw new Error("Object deletion is intentionally not implemented during migration; keep stale objects until cutover is complete");
  }
  const localPersistRoot = path.join(ROOT, ".local/wrangler");
  const manifest = plan.to_upload.filter((entry) => entry.key === "data/release-manifest.json");
  const resumeFrom = String(options.get("resume-from") || "");
  const otherObjects = plan.to_upload.filter((entry) =>
    entry.key !== "data/release-manifest.json"
      && (!resumeFrom || entry.key.localeCompare(resumeFrom) >= 0));
  await mapConcurrent(otherObjects, concurrency, async (object) => {
    await retry(
      () => run(bin, putArgs(config, object, path.join(inventory.objectsRoot, object.key), localPersistRoot), { capture: !config.remote }),
      { label: `upload ${object.key}` },
    );
  });
  for (const object of manifest) {
    await retry(
      () => run(bin, putArgs(config, object, path.join(inventory.objectsRoot, object.key), localPersistRoot), { capture: !config.remote }),
      { label: `upload ${object.key}` },
    );
  }
}

async function verifyUploaded(plan, inventory, config, options) {
  const bin = await wranglerBin();
  const concurrency = Math.max(1, Math.min(Number(options.get("concurrency") || 4), 12));
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), `printly-${plan.environment}-verify-`));
  const objects = options.has("full") ? inventory.objects : plan.to_upload;
  const errors = [];
  await mapConcurrent(objects, concurrency, async (object) => {
    const destination = path.join(temporaryRoot, object.key);
    await mkdir(path.dirname(destination), { recursive: true });
    const storageKey = config.remote ? remoteObjectKey(object.key) : object.key;
    const args = ["r2", "object", "get", `${config.bucket}/${storageKey}`, "--file", destination];
    if (config.remote) args.push("--remote");
    else args.push("--local", "--persist-to", path.join(ROOT, ".local/wrangler"));
    try {
      await retry(() => run(bin, args, { capture: true }), { label: `verify ${object.key}` });
      const actual = await hashFile(destination);
      if (actual !== object.sha256) errors.push(`${object.key}: expected ${object.sha256}, got ${actual}`);
    } catch (error) {
      errors.push(`${object.key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  const result = {
    ok: errors.length === 0,
    environment: plan.environment,
    release_id: plan.release_id,
    verified_at: new Date().toISOString(),
    checked_objects: objects.length,
    errors,
  };
  await writeFile(path.join(releaseRoot(plan.release_id), `verification-${plan.environment}.json`), `${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) throw new Error(`R2 verification failed for ${errors.length} objects`);
  return result;
}

async function saveState(plan, inventory, verification) {
  await mkdir(REMOTE_STATE_ROOT, { recursive: true });
  await writeFile(statePath(plan.environment), `${JSON.stringify({
    environment: plan.environment,
    bucket: plan.bucket,
    release_id: plan.release_id,
    verified_at: verification.verified_at,
    objects: inventory.objects,
    invalidation_urls: plan.invalidation_urls,
  }, null, 2)}\n`);
}

async function seedLocalR2(plan, inventory, config) {
  const { Miniflare } = await import("miniflare");
  const persistRoot = path.join(ROOT, ".local/wrangler/v3/r2");
  // A local release must not be validated against HTML left in Cache API by a
  // prior release. Production promotion performs the equivalent URL purge.
  await rm(path.join(ROOT, ".local/wrangler/v3/cache"), { recursive: true, force: true });
  const miniflare = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('local-r2-seed'); } }",
    compatibilityDate: "2026-07-16",
    r2Buckets: { PAGES_BUCKET: config.bucket },
    r2Persist: persistRoot,
  });
  const errors = [];
  try {
    const bucket = await miniflare.getR2Bucket("PAGES_BUCKET");
    for (const object of inventory.objects) {
      const body = await readFile(path.join(inventory.objectsRoot, object.key));
      await bucket.put(object.key, body, {
        httpMetadata: {
          contentType: object.content_type,
          cacheControl: object.cache_control,
        },
      });
    }
    for (const object of inventory.objects) {
      const stored = await bucket.get(object.key);
      if (!stored) {
        errors.push(`${object.key}: missing after local seed`);
        continue;
      }
      const temporary = Buffer.from(await stored.arrayBuffer());
      const actual = (await import("node:crypto")).createHash("sha256").update(temporary).digest("hex");
      if (actual !== object.sha256) errors.push(`${object.key}: sha256 mismatch after local seed`);
    }
  } finally {
    await miniflare.dispose();
  }
  const verification = {
    ok: errors.length === 0,
    environment: "local",
    release_id: plan.release_id,
    verified_at: new Date().toISOString(),
    checked_objects: inventory.objects.length,
    errors,
  };
  await writeFile(path.join(releaseRoot(plan.release_id), "verification-local.json"), `${JSON.stringify(verification, null, 2)}\n`);
  if (!verification.ok) throw new Error(`Local R2 seed verification failed for ${errors.length} objects`);
  return verification;
}

function planSummary(plan) {
  return {
    ok: true,
    mode: "plan-only",
    environment: plan.environment,
    bucket: plan.bucket,
    release_id: plan.release_id,
    prior_release_id: plan.prior_release_id,
    total_objects: plan.total_objects,
    unchanged_objects: plan.unchanged_objects,
    objects_to_upload: plan.to_upload.length,
    objects_to_remove: plan.to_remove.length,
    invalidation_urls: plan.invalidation_urls.length,
    plan_file: path.join(releaseRoot(plan.release_id), `upload-plan-${plan.environment}.json`),
  };
}

async function purgeExactUrls(environment, releaseId, options) {
  const id = safeReleaseId(releaseId);
  assertRemoteWriteAllowed(environment, id, options);
  const zoneId = process.env.CLOUDFLARE_ZONE_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!zoneId || !token) throw new Error("CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN are required");
  const config = environmentConfig(environment);
  const manifest = await readJson(path.join(releaseObjectsRoot(id), "data/release-manifest.json"));
  const urls = [...new Set((manifest.invalidation_urls ?? []).map((url) => new URL(url, config.origin).href))];
  for (let index = 0; index < urls.length; index += 30) {
    const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ files: urls.slice(index, index + 30) }),
    });
    const result = await response.json();
    if (!response.ok || !result.success) throw new Error(`cache purge failed: ${JSON.stringify(result.errors ?? result)}`);
  }
  return { ok: true, environment, release_id: id, purged_urls: urls.length };
}

async function rollbackPlan(environment, releaseId) {
  const id = safeReleaseId(releaseId);
  const current = await readJsonIfPresent(statePath(environment));
  const plan = {
    ok: true,
    mode: "plan-only",
    environment,
    current_release_id: current?.release_id ?? null,
    rollback_release_id: id,
    steps: [
      `Validate local release ${id}`,
      `Upload ${id} to ${ENVIRONMENTS[environment].bucket} with production confirmation`,
      "Validate the temporary origin",
      "Reassign the production route only after validation",
      "Purge the exact HTML URLs listed in the rollback release",
    ],
    note: "This command never changes a route, deployment, bucket, or cache.",
  };
  await writeFile(path.join(releaseRoot(id), `rollback-plan-${environment}.json`), `${JSON.stringify(plan, null, 2)}\n`);
  return plan;
}

async function main() {
  const command = process.argv[2] || "plan";
  const options = parseOptions();
  const environment = String(options.get("environment") || "staging");
  const releaseId = options.get("release");
  if (!releaseId) throw new Error("--release is required");
  if (command === "rollback-plan") {
    console.log(JSON.stringify(await rollbackPlan(environment, releaseId), null, 2));
    return;
  }
  if (command === "purge") {
    console.log(JSON.stringify(await purgeExactUrls(environment, releaseId, options), null, 2));
    return;
  }
  const { plan, inventory, config } = await createPlan(environment, releaseId);
  if (command === "plan") {
    console.log(JSON.stringify(planSummary(plan), null, 2));
    return;
  }
  if (command === "seed-local") {
    if (environment !== "local") throw new Error("seed-local requires --environment local");
    const verification = await seedLocalR2(plan, inventory, config);
    await saveState(plan, inventory, verification);
    console.log(JSON.stringify({ ok: true, plan: planSummary(plan), verification }, null, 2));
    return;
  }
  if (environment !== "local") assertRemoteWriteAllowed(environment, plan.release_id, options);
  if (environment === "local") throw new Error("Use seed-local for the local R2 simulator");
  if (command === "promote") {
    if (environment !== "production") throw new Error("promote requires --environment production");
    const staging = await readJsonIfPresent(statePath("staging"));
    if (staging?.release_id !== plan.release_id) throw new Error("The same release must be verified in staging before production promotion");
  } else if (!["upload", "seed-local"].includes(command)) {
    throw new Error("Expected plan, seed-local, upload, promote, purge, or rollback-plan");
  }
  await assertRemoteManifestMatches(environment, config, plan.prior_release_id, options);
  await uploadPlan(plan, inventory, config, options);
  const verification = await verifyUploaded(plan, inventory, config, options);
  await saveState(plan, inventory, verification);
  console.log(JSON.stringify({ ok: true, plan: planSummary(plan), verification }, null, 2));
}

await main();
