/**
 * One-time Holidays taxonomy cleanup.
 *
 * Run while the local admin dev server is available on port 4538:
 *   node scripts/adjust-holidays-taxonomy.mjs
 */

const origin = process.env.PRINTLY_ADMIN_ORIGIN || "http://localhost:4538";

async function request(path, options = {}) {
  const response = await fetch(`${origin}${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path}: ${payload.error || response.statusText}`);
  }
  return payload;
}

let categories = (await request("/api/admin/categories")).flat;

function byName(name, parentId) {
  const record = categories.find(
    (item) => item.name === name && (parentId === undefined || item.parent_id === parentId),
  );
  if (!record) throw new Error(`Category not found: ${name} (parent ${parentId ?? "any"})`);
  return record;
}

function payloadFor(record, patch = {}) {
  return {
    parent_id: record.parent_id,
    name: record.name,
    slug: record.slug,
    description: record.description ?? null,
    name_zh: record.name_zh ?? null,
    pose_prompt_specs: record.pose_prompt_specs ?? null,
    cover_image: record.cover_image ?? null,
    seo_image_url: record.seo_image_url ?? null,
    sort_order: record.sort_order ?? 0,
    is_active: Boolean(record.is_active),
    ...patch,
  };
}

async function update(record, patch) {
  const updated = await request(`/api/admin/categories/${record.id}`, {
    method: "PUT",
    body: JSON.stringify(payloadFor(record, patch)),
  });
  categories = categories.map((item) => (item.id === updated.id ? updated : item));
  return updated;
}

async function create(input) {
  const created = await request("/api/admin/categories", {
    method: "POST",
    body: JSON.stringify(input),
  });
  categories.push(created);
  return created;
}

async function remove(record) {
  await request(`/api/admin/categories/${record.id}`, { method: "DELETE" });
  categories = categories.filter((item) => item.id !== record.id);
}

async function moveItems(oldParent, nextParent, names) {
  for (const [sortOrder, name] of names.entries()) {
    await update(byName(name, oldParent.id), { parent_id: nextParent.id, sort_order: sortOrder });
  }
}

const holidays = categories.find(
  (item) => item.parent_id === null && item.slug === "holidays",
);
if (!holidays) throw new Error("Root category not found: holidays");
const familyHolidays = byName("Family & Celebrations", holidays.id);
const culturalHolidays = byName("Popular Holidays", holidays.id);

const familyCelebrations = await create({
  parent_id: holidays.id,
  name: "Family Celebrations",
  name_zh: "家庭庆祝",
  slug: "family-celebrations",
  description: null,
  sort_order: 0,
  is_active: true,
});
const popularHolidays = await create({
  parent_id: holidays.id,
  name: "Popular Holidays",
  name_zh: "热门节日",
  slug: "popular-holidays",
  description: null,
  sort_order: 1,
  is_active: true,
});
await moveItems(familyHolidays, familyCelebrations, [
  "Birthday",
  "Mother's Day",
  "Father's Day",
  "Grandparents Day",
  "Children's Day",
  "Wedding",
  "Baby Shower",
  "Anniversary",
]);

await moveItems(culturalHolidays, popularHolidays, [
  "Christmas",
  "Halloween",
  "Easter",
  "Thanksgiving",
  "New Year",
  "New Year's Eve",
  "St. Patrick's Day",
]);
await update(byName("Valentine's Day", familyHolidays.id), {
  parent_id: popularHolidays.id,
  sort_order: 7,
});
await update(byName("Independence Day", culturalHolidays.id), {
  parent_id: popularHolidays.id,
  name: "Fourth of July",
  name_zh: "美国独立日",
  slug: "fourth-of-july",
  sort_order: 9,
});

await remove(familyHolidays);
await remove(culturalHolidays);

for (const [sortOrder, name] of [
  "Popular Holidays",
  "Holidays Around the World",
  "Family Celebrations",
  "School Days",
  "Seasons",
  "Fun & Awareness Days",
].entries()) {
  await update(byName(name, holidays.id), { sort_order: sortOrder });
}

console.log("Holidays taxonomy updated: 6 second-level categories.");
