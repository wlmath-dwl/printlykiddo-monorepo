/**
 * One-time Buildings taxonomy cleanup.
 *
 * Run while the local admin dev server is available on port 4538:
 *   node scripts/adjust-buildings-taxonomy.mjs
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

async function loadCategories() {
  return (await request("/api/admin/categories")).flat;
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

let categories = await loadCategories();

function byName(name, parentId) {
  const record = categories.find(
    (item) => item.name === name && (parentId === undefined || item.parent_id === parentId),
  );
  if (!record) throw new Error(`Category not found: ${name} (parent ${parentId ?? "any"})`);
  return record;
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

const buildings = byName("Buildings", null);
const living = byName("Living Buildings", buildings.id);
const transport = byName("Transport Buildings", buildings.id);
const industrial = byName("Industrial Buildings", buildings.id);
const infrastructure = byName("Infrastructure", buildings.id);
const historic = byName("Historic Buildings", buildings.id);
const fantasy = byName("Fantasy Buildings", buildings.id);

const homes = await create({
  parent_id: buildings.id,
  name: "Homes",
  name_zh: "住宅",
  slug: "homes",
  description: null,
  sort_order: 0,
  is_active: true,
});
const publicBuildings = await create({
  parent_id: buildings.id,
  name: "Public Buildings",
  name_zh: "公共建筑",
  slug: "public-buildings",
  description: null,
  sort_order: 1,
  is_active: true,
});
const commercialBuildings = await create({
  parent_id: buildings.id,
  name: "Commercial Buildings",
  name_zh: "商业建筑",
  slug: "commercial-buildings",
  description: null,
  sort_order: 2,
  is_active: true,
});
const recreation = await create({
  parent_id: buildings.id,
  name: "Recreation",
  name_zh: "休闲场馆",
  slug: "recreation",
  description: null,
  sort_order: 3,
  is_active: true,
});
const transportation = await create({
  parent_id: buildings.id,
  name: "Transportation",
  name_zh: "交通设施",
  slug: "transportation",
  description: null,
  sort_order: 4,
  is_active: true,
});
const farmBuildings = await create({
  parent_id: buildings.id,
  name: "Farm Buildings",
  name_zh: "农场建筑",
  slug: "farm-buildings",
  description: null,
  sort_order: 6,
  is_active: false,
});
const bridges = await create({
  parent_id: buildings.id,
  name: "Bridges",
  name_zh: "桥梁",
  slug: "bridges",
  description: null,
  sort_order: 7,
  is_active: false,
});
const religiousBuildings = await create({
  parent_id: buildings.id,
  name: "Religious Buildings",
  name_zh: "宗教建筑",
  slug: "religious-buildings",
  description: null,
  sort_order: 9,
  is_active: false,
});
const landmarks = await create({
  parent_id: buildings.id,
  name: "Landmarks",
  name_zh: "地标",
  slug: "landmarks",
  description: null,
  sort_order: 11,
  is_active: false,
});

await moveItems(living, homes, [
  "Apartment Building",
  "Cottage",
  "Cabin",
  "Farmhouse",
  "Villa",
  "Townhouse",
  "Bungalow",
  "Hut",
  "Tree House",
  "Igloo",
]);
await moveItems(living, publicBuildings, [
  "School",
  "Kindergarten",
  "University",
  "Hospital",
  "Clinic",
  "Library",
  "Fire Station",
  "Police Station",
  "Post Office",
  "City Hall",
  "Courthouse",
  "Community Center",
]);
await moveItems(living, commercialBuildings, [
  "Restaurant",
  "Cafe",
  "Bakery",
  "Grocery Store",
  "Supermarket",
  "Toy Store",
  "Bookstore",
  "Bank",
  "Office Building",
  "Hotel",
]);
await moveItems(living, recreation, [
  "Museum",
  "Theater",
  "Movie Theater",
  "Gym",
  "Stadium",
  "Swimming Pool",
  "Zoo",
  "Aquarium Building",
]);
await moveItems(transport, transportation, [
  "Train Station",
  "Subway Station",
  "Bus Station",
  "Bus Stop Shelter",
  "Tram Station",
  "Airport",
  "Airport Terminal",
  "Airport Hangar",
  "Harbor",
  "Ferry Terminal",
  "Train Depot",
  "Bus Depot",
  "Parking Garage",
  "Garage",
  "Gas Station",
  "Car Wash",
  "Toll Booth",
  "Control Tower",
  "Rest Stop",
  "Boat House",
]);

await moveItems(industrial, farmBuildings, [
  "Barn",
  "Silo",
  "Greenhouse",
  "Farm Building",
  "Windmill",
  "Storage Shed",
]);
await create({
  parent_id: farmBuildings.id,
  name: "Stable",
  name_zh: "马厩",
  slug: "stable",
  description: null,
  sort_order: 6,
  is_active: false,
});
await create({
  parent_id: farmBuildings.id,
  name: "Chicken Coop",
  name_zh: "鸡舍",
  slug: "chicken-coop",
  description: null,
  sort_order: 7,
  is_active: false,
});

await moveItems(infrastructure, bridges, [
  "Bridge",
  "Suspension Bridge",
  "Stone Bridge",
  "Wooden Bridge",
  "Covered Bridge",
  "Drawbridge",
  "Arch Bridge",
  "Rope Bridge",
]);
await update(byName("Water Park", infrastructure.id), {
  parent_id: recreation.id,
  sort_order: 8,
});
await moveItems(infrastructure, landmarks, [
  "Clock Tower",
  "Bell Tower",
  "Skyscraper",
  "Tower",
  "Observation Tower",
  "Radio Tower",
]);

await moveItems(historic, religiousBuildings, [
  "Temple",
  "Church",
  "Cathedral",
  "Mosque",
  "Pagoda",
  "Shrine",
  "Chapel",
  "Monastery",
]);
for (const name of [
  "Stonehenge",
  "Great Wall",
  "Monument",
  "Memorial",
  "Obelisk",
  "Leaning Tower",
  "Statue",
  "Triumphal Arch",
]) {
  const nextSortOrder = categories.filter((item) => item.parent_id === landmarks.id).length;
  await update(byName(name, historic.id), { parent_id: landmarks.id, sort_order: nextSortOrder });
}

await remove(byName("Tent", living.id));
await remove(byName("Red Barn", industrial.id));
await remove(byName("Shed", industrial.id));
await remove(byName("Medieval Castle", historic.id));
await remove(byName("Ruins", historic.id));
await remove(byName("Ancient Palace", historic.id));
await remove(living);
await remove(transport);

const secondLevelOrder = [
  "Homes",
  "Public Buildings",
  "Commercial Buildings",
  "Recreation",
  "Transportation",
  "Industrial Buildings",
  "Farm Buildings",
  "Bridges",
  "Infrastructure",
  "Religious Buildings",
  "Historic Buildings",
  "Landmarks",
  "Fantasy Buildings",
];

for (const [sortOrder, name] of secondLevelOrder.entries()) {
  await update(byName(name, buildings.id), { sort_order: sortOrder });
}

console.log(`Buildings taxonomy updated: ${secondLevelOrder.length} second-level categories.`);
