/**
 * One-time cleanup for verbose or ambiguous Holidays category names.
 * Run while the local admin dev server is available on port 4538.
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

let holidays = categories.find((item) => item.parent_id === null && item.slug === "holidays");
if (!holidays) throw new Error("Root category not found: holidays");
holidays = await update(holidays, { name: "Holidays", name_zh: "节日" });

const oldWorldHolidays = byName("Holidays Around the World", holidays.id);
const oldSpecialDays = byName("Fun & Awareness Days", holidays.id);

const worldHolidays = await create({
  parent_id: holidays.id,
  name: "World Holidays",
  name_zh: "世界节日",
  slug: "world-holidays",
  description: null,
  sort_order: 1,
  is_active: false,
});
const specialDays = await create({
  parent_id: holidays.id,
  name: "Special Days",
  name_zh: "特别纪念日",
  slug: "special-days",
  description: null,
  sort_order: 5,
  is_active: true,
});

await moveItems(oldWorldHolidays, worldHolidays, [
  "Lunar New Year",
  "Day of the Dead",
  "Hanukkah",
  "Diwali",
  "Cinco de Mayo",
  "Mardi Gras",
  "Kwanzaa",
]);
await update(byName("Eid", oldWorldHolidays.id), {
  parent_id: worldHolidays.id,
  name: "Eid al-Fitr",
  name_zh: "开斋节",
  slug: "eid-al-fitr",
  sort_order: 7,
});

await moveItems(oldSpecialDays, specialDays, [
  "Earth Day",
  "April Fools' Day",
  "Groundhog Day",
  "Arbor Day",
  "World Book Day",
  "World Animal Day",
  "World Oceans Day",
]);

await remove(oldWorldHolidays);
await remove(oldSpecialDays);

for (const [sortOrder, name] of [
  "Popular Holidays",
  "World Holidays",
  "Family Celebrations",
  "School Days",
  "Seasons",
  "Special Days",
].entries()) {
  await update(byName(name, holidays.id), { sort_order: sortOrder });
}

console.log("Holiday naming cleanup completed.");
