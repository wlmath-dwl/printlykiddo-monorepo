import { execFileSync } from "node:child_process";

const DB_PATH = "data/local-admin.sqlite";

function readRows() {
  const output = execFileSync(
    "sqlite3",
    [
      "-json",
      DB_PATH,
      `SELECT id, domain, site_name, contact_url
       FROM backlink_exchanges
       WHERE (contact_email IS NULL OR TRIM(contact_email) = '')
         AND (facebook_url IS NULL OR TRIM(facebook_url) = '')
       ORDER BY priority, domain`,
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(output);
}

function sql(value) {
  if (!value) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function decodeHtml(value) {
  return String(value)
    .replace(/\\\//g, "/")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(html) {
  return decodeHtml(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  );
}

function cleanEmail(email) {
  const normalized = decodeHtml(email)
    .toLowerCase()
    .replace(/^mailto:/, "")
    .split("?")[0]
    .trim()
    .replace(/[.,;:)\]]+$/, "");
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) return null;
  if (
    ["example.com", "yourdomain.com", "domain.com", "email.com", "sentry.io", "schema.org"].some(
      (bad) => normalized.includes(bad),
    )
  ) {
    return null;
  }
  if (/^(noreply|no-reply|donotreply|wordpress|privacy|abuse|hostmaster)@/.test(normalized)) {
    return null;
  }
  return normalized;
}

function extractEmails(html) {
  const found = new Set();
  const decoded = decodeHtml(html);
  for (const match of decoded.matchAll(/mailto:([^"'<>\\s]+)/gi)) {
    const email = cleanEmail(match[1]);
    if (email) found.add(email);
  }
  const text = stripTags(decoded).replace(/\s+/g, " ");
  for (const match of text.matchAll(/[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\s*\.\s*[A-Z]{2,}/gi)) {
    const email = cleanEmail(match[0].replace(/\s+/g, ""));
    if (email) found.add(email);
  }
  for (const match of text.matchAll(/[A-Z0-9._%+-]+\s*(?:\[at\]|\(at\)| at )\s*[A-Z0-9.-]+\s*(?:\[dot\]|\(dot\)| dot )\s*[A-Z]{2,}/gi)) {
    const email = cleanEmail(
      match[0]
        .replace(/\s*(?:\[at\]|\(at\)| at )\s*/i, "@")
        .replace(/\s*(?:\[dot\]|\(dot\)| dot )\s*/gi, ".")
        .replace(/\s+/g, ""),
    );
    if (email) found.add(email);
  }
  return [...found];
}

function cleanFacebook(url) {
  let value = decodeHtml(url)
    .replace(/\\\//g, "/")
    .split("?")[0]
    .replace(/[\\'",<>)\]]+$/g, "")
    .replace(/\/$/, "");
  if (value.startsWith("//")) value = `https:${value}`;
  if (!/^https?:\/\/(www\.)?facebook\.com\//i.test(value)) return null;
  if (/\/(sharer|share\.php|plugins|dialog|login|privacy|policies)\b/i.test(value)) return null;
  if (/facebook\.com\/tr\b/i.test(value)) return null;
  return value.replace(/^http:\/\//i, "https://");
}

function extractFacebooks(html) {
  const found = new Set();
  const decoded = decodeHtml(html);
  for (const match of decoded.matchAll(/https?:\\?\/\\?\/(?:www\.)?facebook\.com\\?\/[^"' <>)\]]+/gi)) {
    const fb = cleanFacebook(match[0]);
    if (fb) found.add(fb);
  }
  for (const match of decoded.matchAll(/(?:href|content)\s*=\s*["'](\/\/(?:www\.)?facebook\.com\/[^"']+)["']/gi)) {
    const fb = cleanFacebook(match[1]);
    if (fb) found.add(fb);
  }
  return [...found];
}

function scoreEmail(email, domain) {
  let score = 0;
  const root = domain.replace(/^www\./, "");
  if (email.endsWith(`@${root}`)) score += 20;
  if (/^(hello|hi|info|contact|support|admin|angie|mariah|brenda|tauna|claren|clarissa|kim|katie|tara|valerie)@/i.test(email)) {
    score += 12;
  }
  if (/mailchimp|convertkit|mediavine|sentry|google|facebook/.test(email)) score -= 50;
  return score;
}

function scoreFacebook(url, domain, siteName) {
  let score = 0;
  const text = `${domain} ${siteName ?? ""}`.toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = url.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (path.includes(domain.split(".")[0].toLowerCase())) score += 20;
  for (const word of text.match(/[a-z0-9]{4,}/g) ?? []) {
    if (path.includes(word)) score += 4;
  }
  if (!url.toLowerCase().includes("/groups/")) score += 3;
  return score;
}

async function fetchText(url) {
  try {
    return execFileSync(
      "curl",
      [
        "-L",
        "-sS",
        "--max-time",
        "15",
        "-A",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        url,
      ],
      { encoding: "utf8", maxBuffer: 12 * 1024 * 1024 },
    );
  } catch {
    return null;
  }
}

async function audit(row) {
  const base = `https://${row.domain}/`;
  const urls = new Set([
    base,
    row.contact_url,
    new URL("contact/", base).toString(),
    new URL("contact-us/", base).toString(),
    new URL("contact-me/", base).toString(),
    new URL("about/", base).toString(),
    new URL("about-me/", base).toString(),
    new URL("work-with-me/", base).toString(),
    new URL("advertise/", base).toString(),
    new URL("advertising/", base).toString(),
    new URL("pr-advertise/", base).toString(),
  ].filter(Boolean));
  const emails = new Set();
  const facebooks = new Set();
  const visited = [];

  for (const url of urls) {
    const html = await fetchText(url);
    if (!html) continue;
    visited.push(url);
    extractEmails(html).forEach((email) => emails.add(email));
    extractFacebooks(html).forEach((fb) => facebooks.add(fb));
  }

  const email =
    [...emails].sort((a, b) => scoreEmail(b, row.domain) - scoreEmail(a, row.domain))[0] ?? null;
  const facebook =
    [...facebooks].sort(
      (a, b) => scoreFacebook(b, row.domain, row.site_name) - scoreFacebook(a, row.domain, row.site_name),
    )[0] ?? null;
  return { ...row, email, facebook, visited };
}

const rows = readRows();
const results = [];
for (const row of rows) {
  const result = await audit(row);
  results.push(result);
  console.log(
    `${row.domain}: email=${result.email ?? "-"} fb=${result.facebook ?? "-"} visited=${result.visited.length}`,
  );
}

const statements = ["BEGIN;"];
for (const result of results) {
  if (result.email || result.facebook) {
    statements.push(`UPDATE backlink_exchanges
      SET contact_email = ${sql(result.email)},
          facebook_url = ${sql(result.facebook)},
          updated_at = datetime('now')
      WHERE id = ${Number(result.id)};`);
  } else if (result.visited.length === 0) {
    statements.push(`UPDATE backlink_exchanges
      SET updated_at = datetime('now')
      WHERE id = ${Number(result.id)};`);
  } else {
    statements.push(`DELETE FROM backlink_exchanges WHERE id = ${Number(result.id)};`);
  }
}
statements.push("COMMIT;");
execFileSync("sqlite3", [DB_PATH, statements.join("\n")], { encoding: "utf8" });
console.log(
  `Updated ${results.filter((item) => item.email || item.facebook).length}, deleted ${
    results.filter((item) => !item.email && !item.facebook && item.visited.length > 0).length
  }, skipped ${results.filter((item) => !item.email && !item.facebook && item.visited.length === 0).length}.`,
);
