/**
 * 一次性：新增 "Early Humans / 古人类" 二级，并按预估数量把史前动物 10 个二级桶
 * 填充三级物种。所有二级填充后启用；已存在的物种自动跳过（幂等）。
 *
 * 在 printly-admin 目录执行：node scripts/fill-prehistoric-species.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dbPath = path.join(root, "data", "local-admin.sqlite");

const PRE = 3103; // Prehistoric Animals (一级)

function nowIso() {
  return new Date().toISOString();
}

const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
const ts = nowIso();

// 若古人类二级不存在则创建（sort_order = 9），并返回其 id
function ensureEarlyHumans() {
  const found = db
    .prepare("SELECT id FROM categories WHERE parent_id = ? AND slug = 'early-humans' AND deleted_at IS NULL")
    .get(PRE);
  if (found) return found.id;
  const r = db
    .prepare(
      `INSERT INTO categories (
        remote_id, parent_id, name, slug, description, name_zh, cover_image,
        sort_order, is_active, created_at, updated_at, sync_status,
        local_updated_at, remote_updated_at_snapshot, last_synced_at, deleted_at
      ) VALUES (NULL, ?, 'Early Humans', 'early-humans', NULL, '古人类', NULL, 9, 1, ?, ?, 'pending_create', ?, NULL, NULL, NULL)`,
    )
    .run(PRE, ts, ts, ts);
  return Number(r.lastInsertRowid);
}

// [英文名, slug, 中文名]
const SPECIES = {
  "ice-age-mammals": [
    ["Columbian Mammoth", "columbian-mammoth", "哥伦比亚猛犸象"],
    ["Mastodon", "mastodon", "乳齿象"],
    ["Giant Ground Sloth", "giant-ground-sloth", "大地懒"],
    ["Megalonyx", "megalonyx", "杰氏地懒"],
    ["Glyptodon", "glyptodon", "雕齿兽"],
    ["Doedicurus", "doedicurus", "星尾兽"],
    ["Cave Bear", "cave-bear", "洞熊"],
    ["Short-faced Bear", "short-faced-bear", "短面熊"],
    ["Cave Lion", "cave-lion", "洞狮"],
    ["American Lion", "american-lion", "美洲拟狮"],
    ["Cave Hyena", "cave-hyena", "洞鬣狗"],
    ["Homotherium", "homotherium", "似剑齿虎"],
    ["Dinofelis", "dinofelis", "恐猫"],
    ["Irish Elk", "irish-elk", "大角鹿"],
    ["Steppe Bison", "steppe-bison", "草原野牛"],
    ["Aurochs", "aurochs", "原牛"],
    ["Giant Beaver", "giant-beaver", "巨河狸"],
    ["Elasmotherium", "elasmotherium", "板齿犀"],
    ["Macrauchenia", "macrauchenia", "后弓兽"],
    ["Toxodon", "toxodon", "箭齿兽"],
    ["Marsupial Lion", "marsupial-lion", "袋狮"],
    ["Diprotodon", "diprotodon", "双门齿兽"],
    ["Procoptodon", "procoptodon", "短面袋鼠"],
    ["Camelops", "camelops", "拟驼"],
    ["Sivatherium", "sivatherium", "西瓦兽"],
  ],
  "marine-reptiles": [
    ["Tylosaurus", "tylosaurus", "海王龙"],
    ["Elasmosaurus", "elasmosaurus", "薄片龙"],
    ["Kronosaurus", "kronosaurus", "克柔龙"],
    ["Liopleurodon", "liopleurodon", "滑齿龙"],
    ["Pliosaurus", "pliosaurus", "上龙"],
    ["Ichthyosaurus", "ichthyosaurus", "鱼龙"],
    ["Ophthalmosaurus", "ophthalmosaurus", "大眼鱼龙"],
    ["Shonisaurus", "shonisaurus", "秀尼鱼龙"],
    ["Temnodontosaurus", "temnodontosaurus", "切齿鱼龙"],
    ["Nothosaurus", "nothosaurus", "幻龙"],
    ["Placodus", "placodus", "楯齿龙"],
    ["Archelon", "archelon", "古巨龟"],
    ["Dolichorhynchops", "dolichorhynchops", "长喙龙"],
    ["Albertonectes", "albertonectes", "阿尔伯塔泳龙"],
    ["Prognathodon", "prognathodon", "倾齿龙"],
    ["Globidens", "globidens", "球齿龙"],
    ["Tanystropheus", "tanystropheus", "长颈龙"],
    ["Mixosaurus", "mixosaurus", "混鱼龙"],
    ["Cymbospondylus", "cymbospondylus", "杯椎鱼龙"],
    ["Henodus", "henodus", "无齿龙"],
    ["Hainosaurus", "hainosaurus", "海诺龙"],
    ["Rhomaleosaurus", "rhomaleosaurus", "强龙"],
    ["Muraenosaurus", "muraenosaurus", "鳗龙"],
  ],
  "pterosaurs": [
    ["Pteranodon", "pteranodon", "无齿翼龙"],
    ["Pterodactylus", "pterodactylus", "翼手龙"],
    ["Quetzalcoatlus", "quetzalcoatlus", "风神翼龙"],
    ["Rhamphorhynchus", "rhamphorhynchus", "喙嘴龙"],
    ["Dimorphodon", "dimorphodon", "双型齿翼龙"],
    ["Tapejara", "tapejara", "古神翼龙"],
    ["Tupandactylus", "tupandactylus", "雷神翼龙"],
    ["Dsungaripterus", "dsungaripterus", "准噶尔翼龙"],
    ["Tropeognathus", "tropeognathus", "古魔翼龙"],
    ["Anhanguera", "anhanguera", "掠海翼龙"],
    ["Nyctosaurus", "nyctosaurus", "夜翼龙"],
    ["Eudimorphodon", "eudimorphodon", "真双型齿翼龙"],
    ["Pterodaustro", "pterodaustro", "南翼龙"],
    ["Thalassodromeus", "thalassodromeus", "海神翼龙"],
    ["Hatzegopteryx", "hatzegopteryx", "哈特兹哥翼龙"],
    ["Ornithocheirus", "ornithocheirus", "鸟掌翼龙"],
    ["Peteinosaurus", "peteinosaurus", "蓓天翼龙"],
    ["Sordes", "sordes", "毛鬼龙"],
    ["Campylognathoides", "campylognathoides", "曲颌形翼龙"],
    ["Istiodactylus", "istiodactylus", "帆翼龙"],
  ],
  "prehistoric-fish": [
    ["Dunkleosteus", "dunkleosteus", "邓氏鱼"],
    ["Megalodon", "megalodon", "巨齿鲨"],
    ["Helicoprion", "helicoprion", "旋齿鲨"],
    ["Leedsichthys", "leedsichthys", "利兹鱼"],
    ["Xiphactinus", "xiphactinus", "剑射鱼"],
    ["Stethacanthus", "stethacanthus", "胸脊鲨"],
    ["Cladoselache", "cladoselache", "裂口鲨"],
    ["Bothriolepis", "bothriolepis", "沟鳞鱼"],
    ["Titanichthys", "titanichthys", "泰坦鱼"],
    ["Hybodus", "hybodus", "弓鲛"],
    ["Edestus", "edestus", "剪齿鲨"],
    ["Onychodus", "onychodus", "爪齿鱼"],
    ["Cephalaspis", "cephalaspis", "头甲鱼"],
    ["Pteraspis", "pteraspis", "鳍甲鱼"],
    ["Dipterus", "dipterus", "双鳍鱼"],
  ],
};

Object.assign(SPECIES, {
  "prehistoric-invertebrates": [
    ["Trilobite", "trilobite", "三叶虫"],
    ["Ammonite", "ammonite", "菊石"],
    ["Anomalocaris", "anomalocaris", "奇虾"],
    ["Arthropleura", "arthropleura", "节胸虫"],
    ["Sea Scorpion", "sea-scorpion", "板足鲎"],
    ["Meganeura", "meganeura", "巨脉蜻蜓"],
    ["Orthoceras", "orthoceras", "直角石"],
    ["Cameroceras", "cameroceras", "房角石"],
    ["Opabinia", "opabinia", "欧巴宾海蝎"],
    ["Hallucigenia", "hallucigenia", "怪诞虫"],
    ["Marrella", "marrella", "马尔虫"],
    ["Belemnite", "belemnite", "箭石"],
    ["Pulmonoscorpius", "pulmonoscorpius", "巨蝎"],
    ["Crinoid", "crinoid", "海百合"],
    ["Pikaia", "pikaia", "皮卡虫"],
  ],
  "prehistoric-reptiles": [
    ["Dimetrodon", "dimetrodon", "异齿龙"],
    ["Titanoboa", "titanoboa", "泰坦巨蟒"],
    ["Sarcosuchus", "sarcosuchus", "帝鳄"],
    ["Deinosuchus", "deinosuchus", "恐鳄"],
    ["Megalania", "megalania", "古巨蜥"],
    ["Gorgonops", "gorgonops", "戈尔工兽"],
    ["Edaphosaurus", "edaphosaurus", "基龙"],
    ["Moschops", "moschops", "麝足兽"],
    ["Lystrosaurus", "lystrosaurus", "水龙兽"],
    ["Scutosaurus", "scutosaurus", "盾甲龙"],
    ["Estemmenosuchus", "estemmenosuchus", "冠鳄兽"],
    ["Inostrancevia", "inostrancevia", "伊诺史川兽"],
    ["Cynognathus", "cynognathus", "犬颌兽"],
    ["Postosuchus", "postosuchus", "波斯特鳄"],
    ["Kaprosuchus", "kaprosuchus", "狼鼻鳄"],
    ["Proterosuchus", "proterosuchus", "古鳄"],
    ["Placerias", "placerias", "三尖叉齿兽"],
    ["Diictodon", "diictodon", "二齿兽"],
    ["Thrinaxodon", "thrinaxodon", "三棱齿兽"],
    ["Coelurosauravus", "coelurosauravus", "空尾蜥"],
  ],
  "early-amphibians": [
    ["Tiktaalik", "tiktaalik", "提塔利克鱼"],
    ["Ichthyostega", "ichthyostega", "鱼石螈"],
    ["Acanthostega", "acanthostega", "棘螈"],
    ["Eryops", "eryops", "引螈"],
    ["Diplocaulus", "diplocaulus", "笠头螈"],
    ["Prionosuchus", "prionosuchus", "锯齿螈"],
    ["Mastodonsaurus", "mastodonsaurus", "乳齿螈"],
    ["Metoposaurus", "metoposaurus", "后额螈"],
    ["Crassigyrinus", "crassigyrinus", "厚蛙螈"],
    ["Seymouria", "seymouria", "蜥螈"],
    ["Pederpes", "pederpes", "彼得普斯螈"],
    ["Gerrothorax", "gerrothorax", "盖头螈"],
  ],
  "prehistoric-birds": [
    ["Terror Bird", "terror-bird", "骇鸟"],
    ["Titanis", "titanis", "泰坦鸟"],
    ["Kelenken", "kelenken", "凯伦肯鸟"],
    ["Argentavis", "argentavis", "阿根廷巨鹰"],
    ["Gastornis", "gastornis", "冠恐鸟"],
    ["Hesperornis", "hesperornis", "黄昏鸟"],
    ["Ichthyornis", "ichthyornis", "鱼鸟"],
    ["Confuciusornis", "confuciusornis", "孔子鸟"],
    ["Dromornis", "dromornis", "雷鸟"],
    ["Elephant Bird", "elephant-bird", "象鸟"],
    ["Moa", "moa", "恐鸟"],
    ["Haast's Eagle", "haasts-eagle", "哈斯特鹰"],
    ["Pelagornis", "pelagornis", "伪齿鸟"],
    ["Sinornis", "sinornis", "中国鸟"],
    ["Genyornis", "genyornis", "牛顿巨鸟"],
  ],
  "early-mammals": [
    ["Paraceratherium", "paraceratherium", "巨犀"],
    ["Andrewsarchus", "andrewsarchus", "安氏兽"],
    ["Uintatherium", "uintatherium", "尤因它兽"],
    ["Daeodon", "daeodon", "完齿兽"],
    ["Basilosaurus", "basilosaurus", "龙王鲸"],
    ["Ambulocetus", "ambulocetus", "走鲸"],
    ["Arsinoitherium", "arsinoitherium", "重脚兽"],
    ["Brontotherium", "brontotherium", "雷兽"],
    ["Chalicotherium", "chalicotherium", "爪兽"],
    ["Hyaenodon", "hyaenodon", "鬣齿兽"],
    ["Platybelodon", "platybelodon", "铲齿象"],
    ["Deinotherium", "deinotherium", "恐象"],
    ["Gomphotherium", "gomphotherium", "嵌齿象"],
    ["Moeritherium", "moeritherium", "始祖象"],
    ["Pakicetus", "pakicetus", "巴基斯坦古鲸"],
    ["Hyracotherium", "hyracotherium", "始祖马"],
    ["Mesohippus", "mesohippus", "中马"],
    ["Thylacosmilus", "thylacosmilus", "袋剑虎"],
    ["Repenomamus", "repenomamus", "爬兽"],
    ["Morganucodon", "morganucodon", "摩尔根兽"],
    ["Gigantopithecus", "gigantopithecus", "巨猿"],
  ],
  "early-humans": [
    ["Neanderthal", "neanderthal", "尼安德特人"],
    ["Homo Erectus", "homo-erectus", "直立人"],
    ["Australopithecus", "australopithecus", "南方古猿"],
    ["Homo Habilis", "homo-habilis", "能人"],
    ["Paranthropus", "paranthropus", "傍人"],
    ["Homo Floresiensis", "homo-floresiensis", "弗洛勒斯人"],
    ["Ardipithecus", "ardipithecus", "地猿"],
    ["Cro-Magnon", "cro-magnon", "克罗马农人"],
  ],
});

// ---- 执行 ----
const insertL3 = db.prepare(
  `INSERT INTO categories (
    remote_id, parent_id, name, slug, description, name_zh, cover_image,
    sort_order, is_active, created_at, updated_at, sync_status,
    local_updated_at, remote_updated_at_snapshot, last_synced_at, deleted_at
  ) VALUES (NULL, ?, ?, ?, NULL, ?, NULL, ?, 1, ?, ?, 'pending_create', ?, NULL, NULL, NULL)`,
);

const activateL2 = db.prepare(
  `UPDATE categories SET is_active = 1, updated_at = ?, local_updated_at = ?,
     sync_status = CASE WHEN sync_status = 'pending_create' THEN 'pending_create' ELSE 'pending_update' END
   WHERE id = ?`,
);

try {
  db.exec("BEGIN IMMEDIATE");

  const earlyHumansId = ensureEarlyHumans();

  // 二级 slug -> id
  const l2Rows = db
    .prepare("SELECT id, slug FROM categories WHERE parent_id = ? AND deleted_at IS NULL")
    .all(PRE);
  const l2IdBySlug = new Map(l2Rows.map((r) => [r.slug, r.id]));
  l2IdBySlug.set("early-humans", earlyHumansId);

  let inserted = 0;
  let skipped = 0;

  for (const [bucketSlug, list] of Object.entries(SPECIES)) {
    const parentId = l2IdBySlug.get(bucketSlug);
    if (!parentId) {
      throw new Error(`未找到二级分类：${bucketSlug}`);
    }

    // 该桶下已有的最大 sort_order，接着往后排
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

    // 桶内已有物种则启用该二级
    activateL2.run(ts, ts, parentId);
  }

  db.exec("COMMIT");
  console.log(`fill-prehistoric-species: 完成。新增三级 ${inserted}，跳过（已存在）${skipped}。`);
} catch (e) {
  db.exec("ROLLBACK");
  console.error(e);
  process.exit(1);
} finally {
  db.close();
}
