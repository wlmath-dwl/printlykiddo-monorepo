import { execFileSync } from "node:child_process";

const DB_PATH = "data/local-admin.sqlite";

function readRows() {
  const output = execFileSync(
    "sqlite3",
    [
      "-json",
      DB_PATH,
      "SELECT id, domain, site_name, contact_email, contact_url, facebook_url FROM backlink_exchanges ORDER BY id",
    ],
    { encoding: "utf8" },
  );
  return JSON.parse(output);
}

function sqlValue(value) {
  if (!value) {
    return "NULL";
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

function updateRows(rows) {
  const statements = [
    "BEGIN;",
    ...rows.map(
      (row) => `UPDATE backlink_exchanges
        SET contact_email = COALESCE(${sqlValue(row.email)}, contact_email),
            contact_url = COALESCE(${sqlValue(row.contactUrl)}, contact_url),
            facebook_url = COALESCE(${sqlValue(row.facebook)}, facebook_url),
            updated_at = datetime('now')
        WHERE id = ${Number(row.id)};`,
    ),
    "COMMIT;",
  ].join("\n");
  execFileSync("sqlite3", [DB_PATH, statements], { encoding: "utf8" });
}

function decodeHtml(value) {
  return value
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

function absoluteUrl(base, href) {
  if (!href) {
    return null;
  }
  let value = href.trim();
  if (!value || value.startsWith("javascript:") || value.startsWith("#")) {
    return null;
  }
  if (value.startsWith("//")) {
    value = `https:${value}`;
  }
  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

function extractAnchors(html, base) {
  const anchors = [];
  const re = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html))) {
    const href = absoluteUrl(base, decodeHtml(match[2]));
    const text = stripTags(match[3]).replace(/\s+/g, " ").trim();
    if (href) {
      anchors.push({ href, text });
    }
  }
  return anchors;
}

function cleanEmail(email) {
  const normalized = email
    .toLowerCase()
    .replace(/^mailto:/, "")
    .split("?")[0]
    .trim()
    .replace(/[.,;:)\]]+$/, "");
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) {
    return null;
  }
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
    if (email) {
      found.add(email);
    }
  }
  const text = stripTags(decoded).replace(/\s+/g, " ");
  for (const match of text.matchAll(/[A-Z0-9._%+-]+\s*@\s*[A-Z0-9.-]+\s*\.\s*[A-Z]{2,}/gi)) {
    const email = cleanEmail(match[0].replace(/\s+/g, ""));
    if (email) {
      found.add(email);
    }
  }
  for (const match of text.matchAll(/[A-Z0-9._%+-]+\s*(?:\[at\]|\(at\)| at )\s*[A-Z0-9.-]+\s*(?:\[dot\]|\(dot\)| dot )\s*[A-Z]{2,}/gi)) {
    const email = cleanEmail(
      match[0]
        .replace(/\s*(?:\[at\]|\(at\)| at )\s*/i, "@")
        .replace(/\s*(?:\[dot\]|\(dot\)| dot )\s*/gi, ".")
        .replace(/\s+/g, ""),
    );
    if (email) {
      found.add(email);
    }
  }
  return [...found];
}

function emailScore(email, domain) {
  let score = 0;
  const root = domain.replace(/^www\./, "");
  if (email.endsWith(`@${root}`)) {
    score += 20;
  }
  if (/^(info|hello|contact|admin|support|beth|cassie|amy|becky|deb|stacey|monique|jolanthe)@/i.test(email)) {
    score += 12;
  }
  return score;
}

function pickEmail(emails, domain) {
  return emails.sort((a, b) => emailScore(b, domain) - emailScore(a, domain))[0] ?? null;
}

function pickContactUrl(urls, domain) {
  const root = domain.replace(/^www\./, "");
  return urls
    .map((url) => {
      const lower = url.toLowerCase();
      let score = 0;
      if (lower.includes("contact")) score += 30;
      if (/work[-_/]?with[-_/]?me|advertis|media[-_/]?kit|sponsor/.test(lower)) score += 24;
      if (lower.includes("about")) score += 8;
      try {
        if (new URL(url).hostname.replace(/^www\./, "") === root) score += 10;
      } catch {}
      return { url, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.url ?? null;
}

function pickFacebook(anchors, domain) {
  const base = domain.split(".")[0].toLowerCase();
  return anchors
    .filter((anchor) => /facebook\.com/i.test(anchor.href) && !/sharer|share\.php|plugins|dialog|login/i.test(anchor.href))
    .map((anchor) => {
      const href = anchor.href.split("?")[0].replace(/\/$/, "");
      let score = 0;
      if (anchor.text.toLowerCase().includes("facebook")) score += 5;
      if (!href.toLowerCase().includes("/groups/")) score += 3;
      if (href.toLowerCase().includes(base)) score += 10;
      return { href, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.href ?? null;
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      },
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !/text\/html|application\/xhtml/.test(contentType)) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function scrapeOne(row) {
  const base = `https://${row.domain}/`;
  const toVisit = new Set([base]);
  [
    "contact",
    "contact-us",
    "about",
    "about-me",
    "work-with-me",
    "advertise",
    "advertising",
    "sponsor",
    "media-kit",
    "disclosures-terms-of-use-and-privacy",
  ].forEach((page) => toVisit.add(new URL(`${page}/`, base).toString()));
  const seen = new Set();
  const emails = new Set();
  const contactUrls = new Set();
  let facebook = null;

  for (const url of toVisit) {
    if (seen.size >= 10) break;
    if (seen.has(url)) continue;
    seen.add(url);
    const html = await fetchText(url);
    if (!html) continue;
    extractEmails(html).forEach((email) => emails.add(email));
    const anchors = extractAnchors(html, url);
    if (!facebook) {
      facebook = pickFacebook(anchors, row.domain);
    }
    anchors.forEach((anchor) => {
      const candidate = `${anchor.href} ${anchor.text}`.toLowerCase();
      if (/contact|work.with.me|work-with-me|advertis|media.kit|media-kit|sponsor|about/.test(candidate)) {
        try {
          const link = new URL(anchor.href);
          if (link.hostname.replace(/^www\./, "") === row.domain.replace(/^www\./, "")) {
            contactUrls.add(anchor.href.split("#")[0]);
          }
        } catch {}
      }
    });
  }

  return {
    id: row.id,
    domain: row.domain,
    email: pickEmail([...emails], row.domain),
    contactUrl: pickContactUrl([...contactUrls, ...seen], row.domain),
    facebook,
  };
}

const rows = readRows();
const results = [];
for (let index = 0; index < rows.length; index += 1) {
  const result = await scrapeOne(rows[index]);
  results.push(result);
  console.log(
    `${index + 1}/${rows.length} ${result.domain}: email=${result.email ?? "-"} fb=${result.facebook ?? "-"} contact=${result.contactUrl ?? "-"}`,
  );
}
updateRows(results);
console.log(`Updated ${results.length} rows.`);
