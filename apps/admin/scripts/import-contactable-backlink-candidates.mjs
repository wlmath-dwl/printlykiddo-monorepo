import { execFileSync } from "node:child_process";

const DB_PATH = "data/local-admin.sqlite";

const candidates = [
  {
    domain: "fromabcstoacts.com",
    site_name: "From ABCs to ACTs",
    contact_name: "Amber",
    facebook_url: "https://www.facebook.com/ABCsToACTs",
    priority: 1,
    topical_fit:
      "Educational printables and hands-on learning site with printables, counting, fine motor, cutting practice, alphabet, and theme packs; suitable for Animal Fine Motor 5-in-1 and Animal Alphabet resources.",
    pitch_angle:
      "Offer a no-prep animal fine motor printable pack with tracing, cutting, number sequencing, grid puzzles, and coloring pages for preschool/kindergarten readers.",
    target_url: "/animals/",
    anchor_text: "animal fine motor printables",
    offered_asset: "Animal Fine Motor 5-in-1 Printable Pack",
  },
  {
    domain: "simplykinder.com",
    site_name: "Simply Kinder",
    contact_email: "hello@SimplyKinder.com",
    priority: 1,
    topical_fit:
      "Kindergarten teacher resource site with free worksheets and classroom activities; suitable for Farm Animals, Dinosaur, and kindergarten animal worksheets.",
    pitch_angle:
      "Offer classroom-ready kindergarten animal printables that include coloring, tracing, cutting, number sequencing, and grid puzzles.",
    target_url: "/animals/farm-animals/",
    anchor_text: "farm animal worksheets",
    offered_asset: "Farm Animals Kindergarten 5-in-1 Printable Pack",
  },
  {
    domain: "kindergartenworksheets.net",
    site_name: "Kindergarten Worksheets",
    priority: 1,
    topical_fit:
      "Dedicated kindergarten worksheet site covering dinosaurs, zoo animals, coloring, math, alphabet, and general learning; suitable for animal worksheet packs.",
    pitch_angle:
      "Offer free kindergarten-ready dinosaur, farm, or zoo animal worksheets as an additional printable resource for their worksheet categories.",
    target_url: "/dinosaurs/",
    anchor_text: "kindergarten dinosaur worksheets",
    offered_asset: "Dinosaur Kindergarten 5-in-1 Worksheet Pack",
  },
  {
    domain: "pre-kpages.com",
    site_name: "Pre-K Pages",
    contact_name: "Vanessa",
    contact_email: "customercare@pre-kpages.com",
    priority: 1,
    topical_fit:
      "Pre-K and preschool teacher resource site with dinosaur themes, classroom themes, literacy, science, and fine motor content; suitable for Dinosaur 5-in-1 and classroom animal packs.",
    pitch_angle:
      "Offer a dinosaur preschool printable pack that can supplement dinosaur theme pages with coloring, tracing, cutting, number sequencing, and grid puzzles.",
    target_url: "/dinosaurs/",
    anchor_text: "preschool dinosaur printables",
    offered_asset: "Dinosaur 5-in-1 Preschool Printable Pack",
  },
  {
    domain: "confessionsofahomeschooler.com",
    site_name: "Confessions of a Homeschooler",
    priority: 2,
    topical_fit:
      "Homeschool mom blog with preschool, kindergarten, curriculum, and printables categories; suitable for Animal Alphabet, Farm Animals, and Dinosaur homeschool packs.",
    pitch_angle:
      "Offer a homeschool-friendly animal printable bundle for preschool/kindergarten morning work or theme weeks.",
    target_url: "/animals/",
    anchor_text: "homeschool animal printables",
    offered_asset: "Animal Homeschool 5-in-1 Printable Pack",
  },
  {
    domain: "miniaturemasterminds.com",
    site_name: "Miniature Masterminds",
    facebook_url: "https://www.facebook.com/miniaturemasterminds",
    priority: 2,
    topical_fit:
      "Free educational printables site with classroom worksheets, curriculum packs, and printable activities; suitable for Animal 5-in-1 and alphabet tracing packs.",
    pitch_angle:
      "Offer a free animal activity pack that fits their printable worksheet library and classroom activity audience.",
    target_url: "/animals/",
    anchor_text: "free animal printables",
    offered_asset: "Animal 5-in-1 Printable Activity Pack",
  },
  {
    domain: "mamajenn.com",
    site_name: "Mama Jenn",
    contact_name: "Jennifer",
    priority: 2,
    topical_fit:
      "Homeschool mom site with free printables, phonics, games, and creative learning resources; suitable for Animal Alphabet and tracing resources.",
    pitch_angle:
      "Offer animal alphabet and tracing worksheets that can support phonics, handwriting, and early literacy practice.",
    target_url: "/animals/",
    anchor_text: "animal alphabet tracing worksheets",
    offered_asset: "Animal Alphabet and Tracing Printable Pack",
  },
  {
    domain: "smartcookieprintables.com",
    site_name: "Smart Cookie Printables",
    priority: 2,
    topical_fit:
      "Printable site with zoo animal worksheets, I Spy activities, and alphabet printables; suitable for Zoo/Ocean Animals and Animal I Spy style packs.",
    pitch_angle:
      "Offer a zoo or ocean animal printable pack with low-prep worksheets, number sequencing, tracing, and visual puzzles.",
    target_url: "/animals/",
    anchor_text: "zoo animal worksheets",
    offered_asset: "Zoo Animals 5-in-1 Printable Pack",
  },
  {
    domain: "planningplaytime.com",
    site_name: "Planning Playtime",
    priority: 2,
    topical_fit:
      "Preschool theme and printables site with dinosaur preschool theme content; suitable for Dinosaur 5-in-1 preschool worksheets.",
    pitch_angle:
      "Offer a dinosaur preschool printable pack as a supplemental no-prep theme resource.",
    target_url: "/dinosaurs/",
    anchor_text: "dinosaur preschool printables",
    offered_asset: "Dinosaur 5-in-1 Preschool Printable Pack",
  },
  {
    domain: "simplelivingmama.com",
    site_name: "Simple Living Mama",
    priority: 2,
    topical_fit:
      "Homeschool/preschool site with forest animal activities; suitable for Forest Animals 5-in-1 and nature-themed animal printables.",
    pitch_angle:
      "Offer a forest animals activity pack with fine motor, tracing, coloring, number sequencing, and grid puzzle pages.",
    target_url: "/animals/forest-animals/",
    anchor_text: "forest animal printables",
    offered_asset: "Forest Animals 5-in-1 Printable Pack",
  },
  {
    domain: "stayathomeeducator.com",
    site_name: "Stay At Home Educator",
    priority: 2,
    topical_fit:
      "Preschool lesson plan and activities site with animal-themed printables; suitable for Ocean, Arctic, Forest, and Animal Fine Motor packs.",
    pitch_angle:
      "Offer a preschool animal printable pack that works for themed lesson plans and hands-on centers.",
    target_url: "/animals/ocean-animals/",
    anchor_text: "ocean animal printables",
    offered_asset: "Ocean Animals 5-in-1 Preschool Printable Pack",
  },
  {
    domain: "lessons4littleones.com",
    site_name: "Lessons for Little Ones",
    priority: 2,
    topical_fit:
      "Preschool/kindergarten teacher site with cutting practice and scissor skills activities; suitable for Animal Fine Motor and Cutting Practice packs.",
    pitch_angle:
      "Offer animal-themed cutting, tracing, and fine motor worksheets to complement scissor skills activities.",
    target_url: "/animals/",
    anchor_text: "animal scissor skills printables",
    offered_asset: "Animal Scissor Skills and Fine Motor Printable Pack",
  },
  {
    domain: "superstarworksheets.com",
    site_name: "Superstar Worksheets",
    priority: 2,
    topical_fit:
      "Large worksheet site with preschool through elementary worksheets and fine motor resources; suitable for Farm Animals, Dinosaur, and Fine Motor packs.",
    pitch_angle:
      "Offer a themed animal worksheet pack aligned with preschool/kindergarten skill practice.",
    target_url: "/animals/farm-animals/",
    anchor_text: "farm animal worksheets",
    offered_asset: "Farm Animals 5-in-1 Worksheet Pack",
  },
  {
    domain: "allkidsnetwork.com",
    site_name: "All Kids Network",
    priority: 2,
    topical_fit:
      "Kids crafts, worksheets, coloring, alphabet, and number worksheet site; suitable for animal coloring and alphabet tracing pages.",
    pitch_angle:
      "Offer high-resolution animal coloring and alphabet tracing resources for their worksheet and craft audience.",
    target_url: "/animals/",
    anchor_text: "animal coloring pages for kids",
    offered_asset: "Animal Coloring and Alphabet Printable Pack",
  },
  {
    domain: "theprimaryparade.com",
    site_name: "The Primary Parade",
    priority: 3,
    topical_fit:
      "Preschool and primary teacher site with preschool dinosaur activities; suitable for Dinosaur 5-in-1 and theme week printables.",
    pitch_angle:
      "Offer dinosaur worksheets that can supplement preschool dinosaur activity posts.",
    target_url: "/dinosaurs/",
    anchor_text: "preschool dinosaur worksheets",
    offered_asset: "Dinosaur 5-in-1 Printable Activity Pack",
  },
  {
    domain: "3boysandadog.com",
    site_name: "3 Boys and a Dog",
    priority: 3,
    topical_fit:
      "Family/homeschool blog with dinosaur printables and kids activities; suitable for Dinosaur and Animal activity packs.",
    pitch_angle:
      "Offer a dinosaur activity pack for kids with multiple printable worksheet formats.",
    target_url: "/dinosaurs/",
    anchor_text: "dinosaur printables for kids",
    offered_asset: "Dinosaur 5-in-1 Printable Activity Pack",
  },
  {
    domain: "busybeekidsprintables.com",
    site_name: "Busy Bee Kids Printables",
    priority: 2,
    topical_fit:
      "Kids printables site with animal printables covering birds, farm, ocean, zoo/safari, and bugs; suitable for themed animal 5-in-1 packs.",
    pitch_angle:
      "Offer farm, ocean, or zoo animal worksheet packs that match their animal printables library.",
    target_url: "/animals/",
    anchor_text: "animal printables for kids",
    offered_asset: "Animal 5-in-1 Printable Activity Pack",
  },
  {
    domain: "mrslearningbee.com",
    site_name: "Mrs Learning Bee",
    priority: 3,
    topical_fit:
      "Teacher resource site with free printable worksheets and classroom materials; suitable for animal tracing and classroom worksheet packs.",
    pitch_angle:
      "Offer simple classroom-ready animal worksheets for early learners.",
    target_url: "/animals/",
    anchor_text: "animal worksheets for kids",
    offered_asset: "Animal Classroom Worksheet Pack",
  },
  {
    domain: "keepingmykiddobusy.com",
    site_name: "Keeping My Kiddo Busy",
    priority: 3,
    topical_fit:
      "Preschool, kindergarten, and first grade free worksheet blog; suitable for Farm, Dinosaur, and Fine Motor packs.",
    pitch_angle:
      "Offer low-prep animal worksheets that fit preschool/kindergarten activities.",
    target_url: "/animals/farm-animals/",
    anchor_text: "farm animal printables",
    offered_asset: "Farm Animals 5-in-1 Printable Pack",
  },
  {
    domain: "littleslovelearning.com",
    site_name: "Littles Love Learning",
    priority: 3,
    topical_fit:
      "Preschool learning site with zoo activities and animal-themed ideas; suitable for Zoo Animals and Animal Number Sequencing resources.",
    pitch_angle:
      "Offer zoo animal worksheets and number sequencing puzzles for preschool theme activities.",
    target_url: "/animals/",
    anchor_text: "zoo animal printables",
    offered_asset: "Zoo Animals 5-in-1 Printable Pack",
  },
];

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
  return [...found];
}

function cleanFacebook(url) {
  let value = decodeHtml(url).split("?")[0].replace(/[\\'",<>)\]]+$/g, "").replace(/\/$/, "");
  if (value.startsWith("//")) value = `https:${value}`;
  if (!/^https?:\/\/(www\.)?facebook\.com\//i.test(value)) return null;
  if (/\/(sharer|share\.php|plugins|dialog|login|privacy|policies|tr)\b/i.test(value)) return null;
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

function scoreFacebook(url, item) {
  let score = 0;
  const haystack = `${item.domain} ${item.site_name}`.toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = url.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (path.includes(item.domain.split(".")[0].toLowerCase())) score += 20;
  for (const word of haystack.match(/[a-z0-9]{4,}/g) ?? []) {
    if (path.includes(word)) score += 4;
  }
  if (!url.toLowerCase().includes("/groups/")) score += 3;
  return score;
}

function scoreEmail(email, item) {
  let score = 0;
  const root = item.domain.replace(/^www\./, "");
  if (email.endsWith(`@${root}`)) score += 20;
  if (/^(hello|hi|info|contact|support|admin|customercare|help|amber|jennifer)@/i.test(email)) {
    score += 12;
  }
  return score;
}

function fetchText(url) {
  try {
    return execFileSync(
      "curl",
      [
        "-L",
        "-sS",
        "--max-time",
        "6",
        "-A",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        url,
      ],
      { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
    );
  } catch {
    return null;
  }
}

function sql(value) {
  if (value === null || value === undefined || value === "") return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function existingDomains() {
  const output = execFileSync("sqlite3", ["-json", DB_PATH, "SELECT domain FROM backlink_exchanges"], {
    encoding: "utf8",
  });
  return new Set(JSON.parse(output).map((row) => row.domain));
}

function audit(item) {
  const base = `https://${item.domain}/`;
  const urls = [
    base,
    new URL("contact/", base).toString(),
    new URL("contact-us/", base).toString(),
    new URL("contact-me/", base).toString(),
    new URL("about/", base).toString(),
    new URL("work-with-me/", base).toString(),
    new URL("advertise/", base).toString(),
  ];
  const emails = new Set();
  const facebooks = new Set();
  if (item.contact_email) emails.add(cleanEmail(item.contact_email) ?? item.contact_email);
  if (item.facebook_url) facebooks.add(cleanFacebook(item.facebook_url) ?? item.facebook_url);
  let contactUrl = null;
  let visited = 0;
  for (const url of urls) {
    const html = fetchText(url);
    if (!html) continue;
    visited += 1;
    if (!contactUrl && /contact|work-with-me|advertise|pr-advertise/.test(url)) {
      contactUrl = url;
    }
    extractEmails(html).forEach((email) => emails.add(email));
    extractFacebooks(html).forEach((fb) => facebooks.add(fb));
  }
  const contact_email =
    [...emails].sort((a, b) => scoreEmail(b, item) - scoreEmail(a, item))[0] ?? null;
  const facebook_url =
    [...facebooks].sort((a, b) => scoreFacebook(b, item) - scoreFacebook(a, item))[0] ?? null;
  return { ...item, contact_email, facebook_url, contact_url: contactUrl, visited };
}

const existing = existingDomains();
const results = candidates.filter((item) => !existing.has(item.domain)).map(audit);
const insertable = results.filter((item) => item.contact_email || item.facebook_url);

for (const item of results) {
  console.log(
    `${item.domain}: email=${item.contact_email ?? "-"} fb=${item.facebook_url ?? "-"} visited=${item.visited}`,
  );
}

if (insertable.length > 0) {
  const statements = ["BEGIN;"];
  for (const item of insertable) {
    statements.push(`INSERT OR IGNORE INTO backlink_exchanges (
      domain, site_name, website_url, contact_name, contact_email, contact_url, facebook_url, status, priority,
      topical_fit, pitch_angle, target_url, anchor_text, offered_asset, created_at, updated_at
    ) VALUES (
      ${sql(item.domain)}, ${sql(item.site_name)}, ${sql(`https://${item.domain}`)}, ${sql(item.contact_name)},
      ${sql(item.contact_email)}, ${sql(item.contact_url)}, ${sql(item.facebook_url)}, 'candidate', ${Number(item.priority)},
      ${sql(item.topical_fit)}, ${sql(item.pitch_angle)}, ${sql(item.target_url)}, ${sql(item.anchor_text)},
      ${sql(item.offered_asset)}, datetime('now'), datetime('now')
    );`);
  }
  statements.push("COMMIT;");
  execFileSync("sqlite3", [DB_PATH, statements.join("\n")], { encoding: "utf8" });
}

console.log(`Inserted ${insertable.length} contactable candidates. Skipped ${results.length - insertable.length}.`);
