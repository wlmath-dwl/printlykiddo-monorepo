import { readFileSync } from "node:fs";

const DEFAULT_SITE_ORIGIN = "https://printlykiddo.com";
const LOCAL_ENV_FILES = [".env.local", ".env", ".dev.vars"];

function loadLocalEnvFiles() {
  for (const file of LOCAL_ENV_FILES) {
    try {
      const content = readFileSync(file, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }
        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match) {
          continue;
        }
        const [, key, rawValue] = match;
        if (process.env[key] !== undefined) {
          continue;
        }
        process.env[key] = rawValue
          .trim()
          .replace(/^(['"])(.*)\1$/, "$2");
      }
    } catch {
      // Optional local env file.
    }
  }
}

function getSiteOrigin() {
  const raw =
    process.env.DEPLOY_REVALIDATE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    DEFAULT_SITE_ORIGIN;
  return raw.trim().replace(/\/+$/, "");
}

function getToken() {
  return process.env.DEPLOY_REVALIDATE_TOKEN || process.env.REVALIDATE_TOKEN;
}

async function main() {
  loadLocalEnvFiles();
  const token = getToken();

  if (!token) {
    console.warn(
      "Skipping deployed ISR purge: DEPLOY_REVALIDATE_TOKEN or REVALIDATE_TOKEN is not configured.",
    );
    return;
  }

  const endpoint = `${getSiteOrigin()}/api/revalidate?purge=isr`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const bodyText = await response.text();
  let body = bodyText;
  try {
    body = JSON.stringify(JSON.parse(bodyText), null, 2);
  } catch {
    // Keep the raw body for non-JSON errors.
  }

  if (!response.ok) {
    throw new Error(
      `Failed to purge deployed ISR cache (${response.status} ${response.statusText}) from ${endpoint}\n${body}`,
    );
  }

  console.log(`Purged deployed ISR cache via ${endpoint}`);
  console.log(body);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
