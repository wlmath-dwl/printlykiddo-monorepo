/**
 * One-time Food taxonomy cleanup.
 *
 * Run while the local admin dev server is available on port 4538:
 *   node scripts/adjust-food-taxonomy.mjs
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

const food = byName("Food", null);
const stapleFoods = byName("Staple Foods", food.id);
const condiments = byName("Condiments", food.id);
const dishes = byName("Dishes", food.id);
const nuts = byName("Nuts", food.id);
const dairy = byName("Dairy", food.id);
const eggs = byName("Eggs", food.id);
const seafood = byName("Seafood", food.id);
const snacks = byName("Snacks", food.id);
const desserts = byName("Desserts", food.id);
const beans = byName("Beans", food.id);

await update(byName("Bread", stapleFoods.id), {
  name: "Bread Loaf",
  name_zh: "面包条",
  slug: "bread-loaf",
});
await update(byName("Noodles", stapleFoods.id), {
  name: "Noodle Bowl",
  name_zh: "面条碗",
  slug: "noodle-bowl",
});

const grains = await create({
  parent_id: food.id,
  name: "Grains",
  name_zh: "谷物",
  slug: "grains",
  description: null,
  sort_order: 2,
  is_active: true,
});
const bread = await create({
  parent_id: food.id,
  name: "Bread",
  name_zh: "面包",
  slug: "bread",
  description: null,
  sort_order: 3,
  is_active: false,
});
const pasta = await create({
  parent_id: food.id,
  name: "Pasta",
  name_zh: "意大利面",
  slug: "pasta",
  description: null,
  sort_order: 4,
  is_active: false,
});
const noodles = await create({
  parent_id: food.id,
  name: "Noodles",
  name_zh: "面条",
  slug: "noodles",
  description: null,
  sort_order: 5,
  is_active: false,
});
const seasonings = await create({
  parent_id: food.id,
  name: "Seasonings",
  name_zh: "调味料",
  slug: "seasonings",
  description: null,
  sort_order: 16,
  is_active: false,
});
const sauces = await create({
  parent_id: food.id,
  name: "Sauces",
  name_zh: "酱料",
  slug: "sauces",
  description: null,
  sort_order: 17,
  is_active: false,
});

await moveItems(stapleFoods, grains, ["Rice", "Wheat", "Oats", "Cereal", "Flour"]);
await moveItems(stapleFoods, bread, [
  "Bread Loaf",
  "Toast",
  "Bagel",
  "Croissant",
  "Baguette",
  "Pita Bread",
  "Bun",
  "Tortilla",
  "Naan",
]);
await moveItems(stapleFoods, pasta, [
  "Spaghetti",
  "Macaroni",
  "Lasagna",
  "Ravioli",
  "Penne",
  "Fettuccine",
]);
await moveItems(stapleFoods, noodles, ["Noodle Bowl", "Ramen", "Udon", "Soba", "Rice Noodles"]);

for (const name of ["Pancake", "Waffle"]) {
  const nextSortOrder = Math.max(
    ...categories.filter((item) => item.parent_id === dishes.id).map((item) => item.sort_order),
  ) + 1;
  await update(byName(name, stapleFoods.id), { parent_id: dishes.id, sort_order: nextSortOrder });
}

await moveItems(condiments, seasonings, [
  "Salt",
  "Sugar",
  "Black Pepper",
  "Garlic",
  "Ginger",
  "Cinnamon",
  "Vanilla",
  "Oregano",
  "Basil Leaves",
  "Parsley Leaves",
]);
await moveItems(condiments, sauces, [
  "Ketchup",
  "Mustard",
  "Mayonnaise",
  "Honey",
  "Jam",
  "Maple Syrup",
  "Soy Sauce",
  "Vinegar",
]);

await update(byName("Peanuts", beans.id), { parent_id: nuts.id, sort_order: 10 });
await update(byName("Ice Cream", dairy.id), { parent_id: desserts.id, sort_order: 15 });
await update(byName("Corn Dog", snacks.id), { parent_id: dishes.id, sort_order: 38 });
await update(byName("Octopus Seafood", seafood.id), { name: "Octopus", name_zh: "章鱼" });

await remove(byName("Milk Carton", dairy.id));
await remove(byName("Easter Egg", eggs.id));
await remove(byName("Acorns", nuts.id));
await remove(stapleFoods);
await remove(condiments);

const foodOrder = [
  "Fruits",
  "Vegetables",
  "Grains",
  "Bread",
  "Pasta",
  "Noodles",
  "Beans",
  "Nuts",
  "Dairy",
  "Eggs",
  "Meat",
  "Seafood",
  "Dishes",
  "Drinks",
  "Snacks",
  "Desserts",
  "Seasonings",
  "Sauces",
];

for (const [sortOrder, name] of foodOrder.entries()) {
  await update(byName(name, food.id), { sort_order: sortOrder });
}

console.log(`Food taxonomy updated: ${foodOrder.length} second-level categories.`);
