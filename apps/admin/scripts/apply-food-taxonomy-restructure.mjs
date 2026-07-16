/**
 * 一次性：按 SEO / 用户认知重构 Food / 食物 分类。
 * 在 printly-admin 目录执行：node scripts/apply-food-taxonomy-restructure.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");

const taxonomy = {
  name: "Food",
  nameZh: "食物",
  slug: "food",
  sortOrder: 5,
  isActive: 0,
  children: [
    {
      name: "Fruits",
      nameZh: "水果",
      slug: "fruits",
      items: [
        ["Apple", "苹果", "apple"],
        ["Banana", "香蕉", "banana"],
        ["Orange", "橙子", "orange"],
        ["Strawberry", "草莓", "strawberry"],
        ["Grapes", "葡萄", "grapes"],
        ["Watermelon", "西瓜", "watermelon"],
        ["Pineapple", "菠萝", "pineapple"],
        ["Lemon", "柠檬", "lemon"],
        ["Cherry", "樱桃", "cherry"],
        ["Peach", "桃子", "peach"],
        ["Pear", "梨", "pear"],
        ["Mango", "芒果", "mango"],
        ["Blueberry", "蓝莓", "blueberry"],
        ["Kiwi", "猕猴桃", "kiwi"],
        ["Coconut", "椰子", "coconut"],
        ["Avocado", "牛油果", "avocado"],
        ["Raspberry", "覆盆子", "raspberry"],
        ["Blackberry", "黑莓", "blackberry"],
        ["Pomegranate", "石榴", "pomegranate"],
        ["Papaya", "木瓜", "papaya"],
        ["Plum", "李子", "plum"],
        ["Melon", "甜瓜", "melon"],
        ["Lime", "青柠", "lime"],
      ],
    },
    {
      name: "Vegetables",
      nameZh: "蔬菜",
      slug: "vegetables",
      items: [
        ["Carrot", "胡萝卜", "carrot"],
        ["Broccoli", "西兰花", "broccoli"],
        ["Tomato", "番茄", "tomato"],
        ["Potato", "土豆", "potato"],
        ["Corn", "玉米", "corn"],
        ["Pumpkin", "南瓜", "pumpkin"],
        ["Cucumber", "黄瓜", "cucumber"],
        ["Onion", "洋葱", "onion"],
        ["Lettuce", "生菜", "lettuce"],
        ["Eggplant", "茄子", "eggplant"],
        ["Mushroom", "蘑菇", "mushroom"],
        ["Spinach", "菠菜", "spinach"],
        ["Bell Pepper", "甜椒", "bell-pepper"],
        ["Peas", "豌豆", "peas"],
        ["Cabbage", "卷心菜", "cabbage"],
        ["Cauliflower", "花椰菜", "cauliflower"],
        ["Radish", "萝卜", "radish"],
        ["Sweet Potato", "红薯", "sweet-potato"],
        ["Zucchini", "西葫芦", "zucchini"],
        ["Celery", "芹菜", "celery"],
        ["Asparagus", "芦笋", "asparagus"],
      ],
    },
    {
      name: "Staple Foods",
      nameZh: "主食",
      slug: "staple-foods",
      items: [
        ["Rice", "米饭", "rice"],
        ["Wheat", "小麦", "wheat"],
        ["Oats", "燕麦", "oats"],
        ["Cereal", "麦片", "cereal"],
        ["Flour", "面粉", "flour"],
        ["Bread", "面包", "bread"],
        ["Toast", "吐司", "toast"],
        ["Bagel", "贝果", "bagel"],
        ["Croissant", "可颂", "croissant"],
        ["Baguette", "法棍", "baguette"],
        ["Pita Bread", "皮塔饼", "pita-bread"],
        ["Bun", "小圆面包", "bun"],
        ["Tortilla", "玉米饼", "tortilla"],
        ["Naan", "印度烤饼", "naan"],
        ["Pancake", "煎饼", "pancake"],
        ["Waffle", "华夫饼", "waffle"],
        ["Spaghetti", "意大利面", "spaghetti"],
        ["Macaroni", "通心粉", "macaroni"],
        ["Lasagna", "千层面", "lasagna"],
        ["Ravioli", "意式馄饨", "ravioli"],
        ["Penne", "斜管面", "penne"],
        ["Fettuccine", "宽意面", "fettuccine"],
        ["Noodles", "面条", "noodles"],
        ["Ramen", "拉面", "ramen"],
        ["Udon", "乌冬面", "udon"],
        ["Soba", "荞麦面", "soba"],
        ["Rice Noodles", "米粉", "rice-noodles"],
      ],
    },
    {
      name: "Beans",
      nameZh: "豆类",
      slug: "beans",
      items: [
        ["Green Beans", "四季豆", "green-beans"],
        ["Kidney Beans", "芸豆", "kidney-beans"],
        ["Pinto Beans", "斑豆", "pinto-beans"],
        ["Black Beans", "黑豆", "black-beans"],
        ["Chickpeas", "鹰嘴豆", "chickpeas"],
        ["Lentils", "扁豆", "lentils"],
        ["Navy Beans", "海军豆", "navy-beans"],
        ["Soybeans", "黄豆", "soybeans"],
        ["Lima Beans", "利马豆", "lima-beans"],
        ["Edamame", "毛豆", "edamame"],
        ["Red Beans", "红豆", "red-beans"],
        ["Peanuts", "花生", "peanuts"],
      ],
    },
    {
      name: "Nuts",
      nameZh: "坚果",
      slug: "nuts",
      items: [
        ["Almonds", "杏仁", "almonds"],
        ["Walnuts", "核桃", "walnuts"],
        ["Cashews", "腰果", "cashews"],
        ["Pistachios", "开心果", "pistachios"],
        ["Hazelnuts", "榛子", "hazelnuts"],
        ["Pecans", "山核桃", "pecans"],
        ["Chestnuts", "栗子", "chestnuts"],
        ["Macadamia Nuts", "夏威夷果", "macadamia-nuts"],
        ["Brazil Nuts", "巴西坚果", "brazil-nuts"],
        ["Pine Nuts", "松子", "pine-nuts"],
        ["Acorns", "橡子", "acorns"],
      ],
    },
    {
      name: "Dairy",
      nameZh: "乳制品",
      slug: "dairy",
      items: [
        ["Milk", "牛奶", "milk"],
        ["Cheese", "奶酪", "cheese"],
        ["Yogurt", "酸奶", "yogurt"],
        ["Butter", "黄油", "butter"],
        ["Cream", "奶油", "cream"],
        ["Milk Carton", "牛奶盒", "milk-carton"],
        ["Cheese Slice", "奶酪片", "cheese-slice"],
        ["Cottage Cheese", "茅屋奶酪", "cottage-cheese"],
        ["Ice Cream", "冰淇淋", "ice-cream"],
        ["Cream Cheese", "奶油奶酪", "cream-cheese"],
      ],
    },
    {
      name: "Eggs",
      nameZh: "蛋类",
      slug: "eggs",
      items: [
        ["Egg", "鸡蛋", "egg"],
        ["Fried Egg", "煎蛋", "fried-egg"],
        ["Boiled Egg", "水煮蛋", "boiled-egg"],
        ["Scrambled Eggs", "炒蛋", "scrambled-eggs"],
        ["Omelette", "煎蛋卷", "omelette"],
        ["Egg Carton", "鸡蛋盒", "egg-carton"],
        ["Easter Egg", "复活节彩蛋", "easter-egg"],
        ["Duck Egg", "鸭蛋", "duck-egg"],
        ["Quail Egg", "鹌鹑蛋", "quail-egg"],
        ["Goose Egg", "鹅蛋", "goose-egg"],
      ],
    },
    {
      name: "Meat",
      nameZh: "肉类",
      slug: "meat",
      items: [
        ["Chicken Leg", "鸡腿", "chicken-leg"],
        ["Steak", "牛排", "steak"],
        ["Bacon", "培根", "bacon"],
        ["Sausage", "香肠", "sausage"],
        ["Ham", "火腿", "ham"],
        ["Turkey Leg", "火鸡腿", "turkey-leg"],
        ["Meatball", "肉丸", "meatball"],
        ["Pork Chop", "猪排", "pork-chop"],
        ["Chicken Wing", "鸡翅", "chicken-wing"],
        ["Ribs", "排骨", "ribs"],
        ["Salami", "萨拉米", "salami"],
        ["Lamb Chop", "羊排", "lamb-chop"],
      ],
    },
    {
      name: "Seafood",
      nameZh: "海鲜",
      slug: "seafood",
      items: [
        ["Fish", "鱼", "fish"],
        ["Shrimp", "虾", "shrimp"],
        ["Salmon", "三文鱼", "salmon"],
        ["Tuna", "金枪鱼", "tuna"],
        ["Oyster", "牡蛎", "oyster"],
        ["Lobster Tail", "龙虾尾", "lobster-tail"],
        ["Clam", "蛤蜊", "clam"],
        ["Squid", "鱿鱼", "squid"],
        ["Scallop", "扇贝", "scallop"],
        ["Crab Legs", "蟹腿", "crab-legs"],
        ["Crab", "螃蟹", "crab"],
        ["Lobster", "龙虾", "lobster"],
        ["Octopus", "章鱼", "octopus"],
        ["Mussels", "贻贝", "mussels"],
      ],
    },
    {
      name: "Dishes",
      nameZh: "菜品",
      slug: "dishes",
      items: [
        ["Pizza", "披萨", "pizza"],
        ["Burger", "汉堡", "burger"],
        ["Sandwich", "三明治", "sandwich"],
        ["Hot Dog", "热狗", "hot-dog"],
        ["Salad", "沙拉", "salad"],
        ["Soup", "汤", "soup"],
        ["Fried Rice", "炒饭", "fried-rice"],
        ["Dumplings", "饺子", "dumplings"],
        ["Bao Buns", "包子", "bao-buns"],
        ["Spring Rolls", "春卷", "spring-rolls"],
        ["Sushi", "寿司", "sushi"],
        ["Sushi Roll", "寿司卷", "sushi-roll"],
        ["Onigiri", "饭团", "onigiri"],
        ["Bento Box", "便当", "bento-box"],
        ["Tempura", "天妇罗", "tempura"],
        ["Takoyaki", "章鱼烧", "takoyaki"],
        ["Curry", "咖喱", "curry"],
        ["Biryani", "印度香饭", "biryani"],
        ["Samosa", "萨莫萨", "samosa"],
        ["Dosa", "印度薄饼", "dosa"],
        ["Taco", "塔可", "taco"],
        ["Burrito", "墨西哥卷饼", "burrito"],
        ["Quesadilla", "墨西哥奶酪饼", "quesadilla"],
        ["Nachos", "墨西哥玉米片", "nachos"],
        ["Enchilada", "墨西哥卷饼", "enchilada"],
        ["Kebab", "烤肉串", "kebab"],
        ["Falafel", "法拉费", "falafel"],
        ["Hummus", "鹰嘴豆泥", "hummus"],
        ["Shawarma", "沙威玛", "shawarma"],
        ["Fish and Chips", "炸鱼薯条", "fish-and-chips"],
        ["Paella", "西班牙海鲜饭", "paella"],
        ["Pierogi", "波兰饺子", "pierogi"],
        ["Goulash", "匈牙利炖肉", "goulash"],
        ["Bibimbap", "韩式拌饭", "bibimbap"],
        ["Kimbap", "韩式紫菜包饭", "kimbap"],
        ["Kimchi Stew", "泡菜汤", "kimchi-stew"],
      ],
    },
    {
      name: "Drinks",
      nameZh: "饮品",
      slug: "drinks",
      items: [
        ["Water", "水", "water"],
        ["Juice", "果汁", "juice"],
        ["Orange Juice", "橙汁", "orange-juice"],
        ["Lemonade", "柠檬水", "lemonade"],
        ["Smoothie", "冰沙", "smoothie"],
        ["Tea", "茶", "tea"],
        ["Coffee", "咖啡", "coffee"],
        ["Hot Chocolate", "热巧克力", "hot-chocolate"],
        ["Soda", "汽水", "soda"],
        ["Milkshake", "奶昔", "milkshake"],
        ["Bubble Tea", "珍珠奶茶", "bubble-tea"],
        ["Coconut Water", "椰子水", "coconut-water"],
        ["Apple Juice", "苹果汁", "apple-juice"],
        ["Iced Tea", "冰茶", "iced-tea"],
      ],
    },
    {
      name: "Snacks",
      nameZh: "零食",
      slug: "snacks",
      items: [
        ["Popcorn", "爆米花", "popcorn"],
        ["Chips", "薯片", "chips"],
        ["Crackers", "饼干片", "crackers"],
        ["Granola Bar", "燕麦棒", "granola-bar"],
        ["Trail Mix", "混合坚果", "trail-mix"],
        ["Fruit Snacks", "水果零食", "fruit-snacks"],
        ["Pretzel", "椒盐卷饼", "pretzel"],
        ["French Fries", "薯条", "french-fries"],
        ["Corn Dog", "玉米热狗", "corn-dog"],
        ["Rice Crackers", "米饼", "rice-crackers"],
        ["Seaweed Snack", "海苔零食", "seaweed-snack"],
        ["Cheese Puffs", "奶酪泡芙", "cheese-puffs"],
      ],
    },
    {
      name: "Desserts",
      nameZh: "甜点",
      slug: "desserts",
      items: [
        ["Cake", "蛋糕", "cake"],
        ["Cupcake", "纸杯蛋糕", "cupcake"],
        ["Donut", "甜甜圈", "donut"],
        ["Pie", "派", "pie"],
        ["Brownie", "布朗尼", "brownie"],
        ["Pudding", "布丁", "pudding"],
        ["Candy", "糖果", "candy"],
        ["Chocolate", "巧克力", "chocolate"],
        ["Cookie", "曲奇", "cookie"],
        ["Ice Cream Cone", "冰淇淋甜筒", "ice-cream-cone"],
        ["Popsicle", "冰棒", "popsicle"],
        ["Macaron", "马卡龙", "macaron"],
        ["Mochi", "麻薯", "mochi"],
        ["Cheesecake", "芝士蛋糕", "cheesecake"],
        ["Cinnamon Roll", "肉桂卷", "cinnamon-roll"],
      ],
    },
    {
      name: "Condiments",
      nameZh: "酱料调味",
      slug: "condiments",
      items: [
        ["Salt", "盐", "salt"],
        ["Sugar", "糖", "sugar"],
        ["Black Pepper", "黑胡椒", "black-pepper"],
        ["Ketchup", "番茄酱", "ketchup"],
        ["Mustard", "芥末酱", "mustard"],
        ["Mayonnaise", "蛋黄酱", "mayonnaise"],
        ["Honey", "蜂蜜", "honey"],
        ["Jam", "果酱", "jam"],
        ["Maple Syrup", "枫糖浆", "maple-syrup"],
        ["Soy Sauce", "酱油", "soy-sauce"],
        ["Vinegar", "醋", "vinegar"],
        ["Garlic", "大蒜", "garlic"],
        ["Ginger", "姜", "ginger"],
        ["Cinnamon", "肉桂", "cinnamon"],
        ["Vanilla", "香草", "vanilla"],
        ["Oregano", "牛至", "oregano"],
        ["Basil Leaves", "罗勒叶", "basil-leaves"],
        ["Parsley Leaves", "欧芹叶", "parsley-leaves"],
      ],
    },
  ],
};

const obsoleteSecondLevelSlugs = new Set(["bread", "pasta", "seasonings"]);

function nowIso() {
  return new Date().toISOString();
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const ts = nowIso();
const expectedSecondLevelSlugs = new Set(taxonomy.children.map((child) => child.slug));
const expectedChildSlugsByParentSlug = new Map(
  taxonomy.children.map((child) => [child.slug, new Set(child.items.map((item) => item[2]))]),
);

const getByParentAndSlug = db.prepare(
  "SELECT * FROM categories WHERE parent_id IS ? AND slug = ? ORDER BY deleted_at IS NOT NULL ASC, id ASC LIMIT 1",
);
const getActiveByRootAndSlug = db.prepare(
  `SELECT c.*
   FROM categories c
   JOIN categories p ON p.id = c.parent_id
   WHERE p.parent_id = ?
     AND c.slug = ?
     AND c.deleted_at IS NULL
   ORDER BY c.id ASC
   LIMIT 1`,
);
const getByParentAndName = db.prepare(
  "SELECT * FROM categories WHERE parent_id IS ? AND lower(name) = lower(?) ORDER BY deleted_at IS NOT NULL ASC, id ASC LIMIT 1",
);
const insertStmt = db.prepare(
  `INSERT INTO categories (
    remote_id, parent_id, name, slug, description, name_zh, cover_image,
    sort_order, is_active, created_at, updated_at, sync_status,
    local_updated_at, remote_updated_at_snapshot, last_synced_at, deleted_at
  ) VALUES (NULL, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?, 'pending_create', ?, NULL, NULL, NULL)`,
);
const updateStmt = db.prepare(
  `UPDATE categories
   SET parent_id = ?, name = ?, slug = ?, name_zh = ?, sort_order = ?, is_active = ?, deleted_at = NULL,
       updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);
const touchStmt = db.prepare(
  `UPDATE categories
   SET updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);
const softDeleteStmt = db.prepare(
  `UPDATE categories
   SET deleted_at = ?, updated_at = ?, local_updated_at = ?,
       sync_status = CASE WHEN remote_id IS NULL THEN sync_status ELSE 'pending_delete' END
   WHERE id = ?`,
);

function ensureCategory({ rootId, parentId, name, nameZh, slug, sortOrder, isActive }) {
  let existing = getByParentAndSlug.get(parentId, slug) ?? getByParentAndName.get(parentId, name);
  if (!existing && rootId && parentId !== rootId) {
    existing = getActiveByRootAndSlug.get(rootId, slug);
  }

  if (existing) {
    updateStmt.run(parentId, name, slug, nameZh, sortOrder, isActive, ts, ts, existing.id);
    return { id: Number(existing.id), created: false };
  }

  const result = insertStmt.run(parentId, name, slug, nameZh, sortOrder, isActive, ts, ts, ts);
  return { id: Number(result.lastInsertRowid), created: true };
}

function collectDescendantIds(categoryId) {
  const rows = db
    .prepare(
      `WITH RECURSIVE tree(id) AS (
        SELECT id FROM categories WHERE id = ?
        UNION ALL
        SELECT c.id
        FROM categories c
        JOIN tree ON c.parent_id = tree.id
        WHERE c.deleted_at IS NULL
      )
      SELECT id FROM tree WHERE id != ?`,
    )
    .all(categoryId, categoryId);
  return rows.map((row) => Number(row.id));
}

function softDeleteCategoryTree(categoryId) {
  const ids = [...collectDescendantIds(categoryId).reverse(), categoryId];
  ids.forEach((id) => softDeleteStmt.run(ts, ts, ts, id));
  return ids.length;
}

function countFood(rootId) {
  return db
    .prepare(
      `WITH RECURSIVE tree(id, depth) AS (
        SELECT id, 1 FROM categories WHERE id = ? AND deleted_at IS NULL
        UNION ALL
        SELECT c.id, tree.depth + 1
        FROM categories c
        JOIN tree ON c.parent_id = tree.id
        WHERE c.deleted_at IS NULL
      )
      SELECT
        SUM(depth = 2) AS level2,
        SUM(depth = 3) AS level3,
        COUNT(*) AS total
      FROM tree`,
    )
    .get(rootId);
}

try {
  db.exec("BEGIN IMMEDIATE");

  let created = 0;
  let updated = 0;
  let deleted = 0;

  const rootResult = ensureCategory({
    rootId: null,
    parentId: null,
    name: taxonomy.name,
    nameZh: taxonomy.nameZh,
    slug: taxonomy.slug,
    sortOrder: taxonomy.sortOrder,
    isActive: taxonomy.isActive,
  });
  created += rootResult.created ? 1 : 0;
  updated += rootResult.created ? 0 : 1;

  taxonomy.children.forEach((child, childIndex) => {
    const childResult = ensureCategory({
      rootId: rootResult.id,
      parentId: rootResult.id,
      name: child.name,
      nameZh: child.nameZh,
      slug: child.slug,
      sortOrder: childIndex,
      isActive: taxonomy.isActive,
    });
    created += childResult.created ? 1 : 0;
    updated += childResult.created ? 0 : 1;

    child.items.forEach(([name, nameZh, slug], itemIndex) => {
      const itemResult = ensureCategory({
        rootId: rootResult.id,
        parentId: childResult.id,
        name,
        nameZh,
        slug,
        sortOrder: itemIndex,
        isActive: taxonomy.isActive,
      });
      created += itemResult.created ? 1 : 0;
      updated += itemResult.created ? 0 : 1;
    });

    touchStmt.run(ts, ts, childResult.id);
  });

  const secondLevelRows = db
    .prepare("SELECT id, slug FROM categories WHERE parent_id = ? AND deleted_at IS NULL")
    .all(rootResult.id);

  secondLevelRows.forEach((row) => {
    const slug = String(row.slug);
    if (!expectedSecondLevelSlugs.has(slug) || obsoleteSecondLevelSlugs.has(slug)) {
      deleted += softDeleteCategoryTree(Number(row.id));
    }
  });

  const expectedParentBySlug = new Map(
    db
      .prepare("SELECT id, slug FROM categories WHERE parent_id = ? AND deleted_at IS NULL")
      .all(rootResult.id)
      .map((row) => [String(row.slug), Number(row.id)]),
  );

  expectedParentBySlug.forEach((parentId, parentSlug) => {
    const expectedSlugs = expectedChildSlugsByParentSlug.get(parentSlug);
    if (!expectedSlugs) return;

    const rows = db
      .prepare("SELECT id, slug FROM categories WHERE parent_id = ? AND deleted_at IS NULL")
      .all(parentId);
    rows.forEach((row) => {
      if (!expectedSlugs.has(String(row.slug))) {
        deleted += softDeleteCategoryTree(Number(row.id));
      }
    });
  });

  touchStmt.run(ts, ts, rootResult.id);

  const summary = countFood(rootResult.id);
  db.exec("COMMIT");
  console.log(
    `apply-food-taxonomy-restructure: 完成。root_id=${rootResult.id}, level2=${summary.level2}, level3=${summary.level3}, total=${summary.total}, created=${created}, updated=${updated}, soft_deleted=${deleted}`,
  );
} catch (error) {
  db.exec("ROLLBACK");
  console.error(error);
  process.exitCode = 1;
} finally {
  db.close();
}
