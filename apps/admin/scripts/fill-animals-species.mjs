/**
 * 一次性：给 Animals(4) 下每个二级补充合理的三级物种。
 * - 只添加与栖息地相符、且与现有物种不重复的种
 * - 新增三级一律 is_active = 0（非活跃，待出图后再启用）
 * - 不改动任何二级的启用状态
 * - 幂等：已存在的 slug 自动跳过
 *
 * 在 printly-admin 目录执行：node scripts/fill-animals-species.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");

const ANIMALS = 4;

function nowIso() {
  return new Date().toISOString();
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
const ts = nowIso();

// L2 slug -> [英文名, slug, 中文名][]
const SPECIES = {
  pets: [
    ["Gerbil", "gerbil", "沙鼠"],
    ["Canary", "canary", "金丝雀"],
    ["Lovebird", "lovebird", "牡丹鹦鹉"],
    ["Hermit Crab", "hermit-crab", "寄居蟹"],
    ["Leopard Gecko", "leopard-gecko", "豹纹守宫"],
    ["Bearded Dragon", "bearded-dragon", "鬃狮蜥"],
    ["Guppy", "guppy", "孔雀鱼"],
    ["Poodle", "poodle", "贵宾犬"],
    ["Beagle", "beagle", "比格犬"],
    ["German Shepherd", "german-shepherd", "德国牧羊犬"],
    ["Golden Retriever", "golden-retriever", "金毛寻回犬"],
    ["Bulldog", "bulldog", "斗牛犬"],
    ["Corgi", "corgi", "柯基犬"],
    ["Siberian Husky", "siberian-husky", "西伯利亚哈士奇"],
    ["Persian Cat", "persian-cat", "波斯猫"],
    ["Siamese Cat", "siamese-cat", "暹罗猫"],
  ],
  "farm-animals": [
    ["Goose", "goose", "鹅"],
    ["Gosling", "gosling", "小鹅"],
    ["Llama", "llama", "美洲驼"],
    ["Bull", "bull", "公牛"],
    ["Foal", "foal", "马驹"],
    ["Chick", "chick", "小鸡"],
    ["Duckling", "duckling", "小鸭"],
    ["Guinea Fowl", "guinea-fowl", "珍珠鸡"],
    ["Mule", "mule", "骡"],
    ["Water Buffalo", "water-buffalo", "水牛"],
    ["Highland Cow", "highland-cow", "高地牛"],
  ],
  "safari-animals": [
    ["African Buffalo", "african-buffalo", "非洲水牛"],
    ["Wildebeest", "wildebeest", "角马"],
    ["Impala", "impala", "黑斑羚"],
    ["Springbok", "springbok", "跳羚"],
    ["Kudu", "kudu", "弯角羚"],
    ["Eland", "eland", "大羚羊"],
    ["Hyena", "hyena", "鬣狗"],
    ["African Wild Dog", "african-wild-dog", "非洲野犬"],
    ["Jackal", "jackal", "胡狼"],
    ["Mongoose", "mongoose", "獴"],
    ["Aardvark", "aardvark", "土豚"],
    ["Caracal", "caracal", "狞猫"],
    ["Serval", "serval", "薮猫"],
    ["Secretary Bird", "secretary-bird", "蛇鹫"],
    ["Vulture", "vulture", "秃鹫"],
  ],
  "ocean-animals": [
    ["Whale", "whale", "鲸"],
    ["Great White Shark", "great-white-shark", "大白鲨"],
    ["Hammerhead Shark", "hammerhead-shark", "双髻鲨"],
    ["Whale Shark", "whale-shark", "鲸鲨"],
    ["Manta Ray", "manta-ray", "蝠鲼"],
    ["Sea Otter", "sea-otter", "海獭"],
    ["Crab", "crab", "螃蟹"],
    ["Lobster", "lobster", "龙虾"],
    ["Sea Lion", "sea-lion", "海狮"],
    ["Pufferfish", "pufferfish", "河豚"],
    ["Swordfish", "swordfish", "剑鱼"],
    ["Moray Eel", "moray-eel", "海鳝"],
    ["Cuttlefish", "cuttlefish", "乌贼"],
    ["Squid", "squid", "鱿鱼"],
    ["Sea Urchin", "sea-urchin", "海胆"],
    ["Anglerfish", "anglerfish", "鮟鱇"],
  ],
  "forest-animals": [
    ["Raccoon", "raccoon", "浣熊"],
    ["Badger", "badger", "獾"],
    ["Porcupine", "porcupine", "豪猪"],
    ["Opossum", "opossum", "负鼠"],
    ["Weasel", "weasel", "鼬"],
    ["Owl", "owl", "猫头鹰"],
    ["Woodpecker", "woodpecker", "啄木鸟"],
    ["Cardinal", "cardinal", "红雀"],
    ["Blue Jay", "blue-jay", "冠蓝鸦"],
    ["Wild Boar", "wild-boar", "野猪"],
    ["Elk", "elk", "马鹿"],
    ["Lynx", "lynx", "猞猁"],
    ["Bobcat", "bobcat", "短尾猫"],
    ["Black Bear", "black-bear", "黑熊"],
    ["Grizzly Bear", "grizzly-bear", "灰熊"],
    ["Bat", "bat", "蝙蝠"],
  ],
};

Object.assign(SPECIES, {
  "arctic-animals": [
    ["Penguin", "penguin", "企鹅"],
    ["Musk Ox", "musk-ox", "麝牛"],
    ["Lemming", "lemming", "旅鼠"],
    ["Arctic Wolf", "arctic-wolf", "北极狼"],
    ["Puffin", "puffin", "海鹦"],
    ["Leopard Seal", "leopard-seal", "豹海豹"],
    ["Snow Goose", "snow-goose", "雪雁"],
    ["Ermine", "ermine", "白鼬"],
  ],
  "jungle-animals": [
    ["Toucan", "toucan", "巨嘴鸟"],
    ["Macaw", "macaw", "金刚鹦鹉"],
    ["Parrot", "parrot", "鹦鹉"],
    ["Poison Dart Frog", "poison-dart-frog", "箭毒蛙"],
    ["Anaconda", "anaconda", "森蚺"],
    ["King Cobra", "king-cobra", "眼镜王蛇"],
    ["Lemur", "lemur", "狐猴"],
    ["Chimpanzee", "chimpanzee", "黑猩猩"],
    ["Gibbon", "gibbon", "长臂猿"],
    ["Spider Monkey", "spider-monkey", "蜘蛛猴"],
    ["Howler Monkey", "howler-monkey", "吼猴"],
    ["Okapi", "okapi", "㺢㹢狓"],
    ["Green Iguana", "green-iguana", "绿鬣蜥"],
    ["Kinkajou", "kinkajou", "蜜熊"],
    ["Flying Fox", "flying-fox", "狐蝠"],
  ],
  "desert-animals": [
    ["Gila Monster", "gila-monster", "毒蜥"],
    ["Rattlesnake", "rattlesnake", "响尾蛇"],
    ["Kangaroo Rat", "kangaroo-rat", "更格卢鼠"],
    ["Jackrabbit", "jackrabbit", "长耳大野兔"],
    ["Armadillo", "armadillo", "犰狳"],
    ["Chuckwalla", "chuckwalla", "沙漠鬣蜥"],
    ["Burrowing Owl", "burrowing-owl", "穴鸮"],
    ["Cactus Wren", "cactus-wren", "仙人掌鹪鹩"],
    ["Bactrian Camel", "bactrian-camel", "双峰驼"],
    ["Camel Spider", "camel-spider", "骆驼蜘蛛"],
    ["Antlion", "antlion", "蚁狮"],
  ],
  "australian-animals": [
    ["Dingo", "dingo", "澳洲野犬"],
    ["Tree Kangaroo", "tree-kangaroo", "树袋鼠"],
    ["Sugar Glider", "sugar-glider", "蜜袋鼯"],
    ["Bilby", "bilby", "兔耳袋狸"],
    ["Numbat", "numbat", "袋食蚁兽"],
    ["Cassowary", "cassowary", "鹤鸵"],
    ["Cockatoo", "cockatoo", "凤头鹦鹉"],
    ["Galah", "galah", "粉红凤头鹦鹉"],
    ["Frilled Lizard", "frilled-lizard", "伞蜥"],
    ["Thorny Devil", "thorny-devil", "澳洲魔蜥"],
    ["Bandicoot", "bandicoot", "袋狸"],
    ["Brushtail Possum", "brushtail-possum", "帚尾袋貂"],
    ["Lyrebird", "lyrebird", "琴鸟"],
    ["Goanna", "goanna", "巨蜥"],
    ["Saltwater Crocodile", "saltwater-crocodile", "咸水鳄"],
  ],
  "freshwater-animals": [
    ["River Otter", "river-otter", "水獭"],
    ["Axolotl", "axolotl", "美西螈"],
    ["Piranha", "piranha", "食人鱼"],
    ["Koi", "koi", "锦鲤"],
    ["Salmon", "salmon", "鲑鱼"],
    ["Trout", "trout", "鳟鱼"],
    ["Catfish", "catfish", "鲶鱼"],
    ["Largemouth Bass", "largemouth-bass", "大口黑鲈"],
    ["Crayfish", "crayfish", "小龙虾"],
    ["Snapping Turtle", "snapping-turtle", "鳄龟"],
    ["Bullfrog", "bullfrog", "牛蛙"],
    ["Muskrat", "muskrat", "麝鼠"],
    ["Heron", "heron", "苍鹭"],
    ["Kingfisher", "kingfisher", "翠鸟"],
    ["Mallard", "mallard", "绿头鸭"],
  ],
  "mountain-animals": [
    ["Mountain Lion", "mountain-lion", "美洲狮"],
    ["Red Panda", "red-panda", "小熊猫"],
    ["Giant Panda", "giant-panda", "大熊猫"],
    ["Japanese Macaque", "japanese-macaque", "日本猕猴"],
    ["Takin", "takin", "羚牛"],
    ["Golden Snub-nosed Monkey", "golden-snub-nosed-monkey", "金丝猴"],
    ["Golden Eagle", "golden-eagle", "金雕"],
    ["Spectacled Bear", "spectacled-bear", "眼镜熊"],
    ["Kea", "kea", "啄羊鹦鹉"],
    ["Serow", "serow", "鬣羚"],
  ],
});

// ---- 执行 ----
const insertL3 = db.prepare(
  `INSERT INTO categories (
    remote_id, parent_id, name, slug, description, name_zh, cover_image,
    sort_order, is_active, created_at, updated_at, sync_status,
    local_updated_at, remote_updated_at_snapshot, last_synced_at, deleted_at
  ) VALUES (NULL, ?, ?, ?, NULL, ?, NULL, ?, 0, ?, ?, 'pending_create', ?, NULL, NULL, NULL)`,
);

try {
  db.exec("BEGIN IMMEDIATE");

  const l2Rows = db
    .prepare("SELECT id, slug FROM categories WHERE parent_id = ? AND deleted_at IS NULL")
    .all(ANIMALS);
  const l2IdBySlug = new Map(l2Rows.map((r) => [r.slug, r.id]));

  let inserted = 0;
  let skipped = 0;

  for (const [bucketSlug, list] of Object.entries(SPECIES)) {
    const parentId = l2IdBySlug.get(bucketSlug);
    if (!parentId) {
      throw new Error(`未找到 Animals 下的二级：${bucketSlug}`);
    }

    const maxRow = db
      .prepare("SELECT COALESCE(MAX(sort_order), -1) AS m FROM categories WHERE parent_id = ? AND deleted_at IS NULL")
      .get(parentId);
    let ord = Number(maxRow.m) + 1;

    for (const [name, slug, zh] of list) {
      const exists = db
        .prepare("SELECT id FROM categories WHERE parent_id = ? AND slug = ? AND deleted_at IS NULL LIMIT 1")
        .get(parentId, slug);
      if (exists) {
        skipped += 1;
        continue;
      }
      insertL3.run(parentId, name, slug, zh, ord, ts, ts, ts);
      ord += 1;
      inserted += 1;
    }
  }

  db.exec("COMMIT");
  console.log(`fill-animals-species: 完成。新增三级 ${inserted}（非活跃），跳过（已存在）${skipped}。`);
} catch (e) {
  db.exec("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  db.close();
}
