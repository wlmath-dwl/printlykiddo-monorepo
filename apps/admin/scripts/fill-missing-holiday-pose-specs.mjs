import Database from "better-sqlite3";

const db = new Database("data/local-admin.sqlite");

const specsBySlug = {
  "valentines-day": [
    ["爱心", "Heart"],
    ["玫瑰", "Rose"],
    ["丘比特", "Cupid"],
    ["泰迪熊", "Teddy Bear"],
  ],
  "new-year": [
    ["倒计时钟", "Countdown Clock"],
    ["烟花", "Fireworks"],
    ["派对帽", "Party Hat"],
    ["彩纸礼花筒", "Confetti Popper"],
  ],
  "st-patricks-day": [
    ["三叶草", "Shamrock"],
    ["爱尔兰小矮人", "Leprechaun"],
    ["金币罐", "Pot of Gold"],
    ["彩虹", "Rainbow"],
  ],
  "lunar-new-year": [
    ["红包", "Red Envelope"],
    ["中国龙", "Chinese Dragon"],
    ["红灯笼", "Red Lantern"],
    ["生肖动物", "Zodiac Animal"],
  ],
  "independence-day": [
    ["美国国旗", "American Flag"],
    ["烟花", "Fireworks"],
    ["白头海雕", "Bald Eagle"],
    ["自由钟", "Liberty Bell"],
  ],
  "april-fools-day": [
    ["宫廷小丑", "Jester"],
    ["弹簧惊吓盒", "Jack in the Box"],
    ["恶作剧小鱼", "Prank Fish"],
    ["放屁垫", "Whoopee Cushion"],
  ],
  "groundhog-day": [
    ["土拨鼠", "Groundhog"],
    ["土拨鼠影子", "Groundhog Shadow"],
    ["树桩", "Tree Stump"],
    ["礼帽", "Top Hat"],
  ],
  "grandparents-day": [
    ["祖父母拥抱", "Grandparents Hug"],
    ["手印爱心", "Handprint Heart"],
    ["祖父母花束", "Grandparents Flowers"],
    ["祖父母贺卡", "Grandparents Card"],
  ],
  "childrens-day": [
    ["快乐儿童", "Happy Children"],
    ["彩色气球", "Colorful Balloons"],
    ["鲤鱼旗", "Koinobori"],
    ["玩具积木", "Toy Blocks"],
  ],
  "arbor-day": [
    ["树", "Tree"],
    ["树苗", "Seedling"],
    ["铲子", "Shovel"],
    ["浇水壶", "Watering Can"],
  ],
  "world-book-day": [
    ["打开的书", "Open Book"],
    ["书签", "Bookmark"],
    ["阅读儿童", "Reading Child"],
    ["书堆", "Book Stack"],
  ],
  "world-animal-day": [
    ["爪印", "Paw Print"],
    ["猫和狗", "Cat and Dog"],
    ["野生动物", "Wild Animals"],
    ["动物地球", "Animal Globe"],
  ],
  "world-oceans-day": [
    ["海浪", "Ocean Wave"],
    ["鲸鱼", "Whale"],
    ["海龟", "Sea Turtle"],
    ["珊瑚礁", "Coral Reef"],
  ],
};

function now() {
  return new Date().toISOString();
}

function buildSpecs(items) {
  return items.map(([titleZh, titleEn], index) => ({
    key: `pose-${index + 1}`,
    titleZh,
    titleEn,
  }));
}

function buildPromptZh(titleZh) {
  return `绘制${titleZh}姿态的图`;
}

function buildPromptEn(categoryName, titleEn, sourceKind) {
  const mode =
    sourceKind === "outline"
      ? "a clean black-and-white outline source image"
      : sourceKind === "scene_color"
        ? "a simple full-scene color source image"
        : "a clean color source image";
  return `Create ${mode} for a children's printable resource. Theme: ${categoryName}. Main subject: ${titleEn}. Use a friendly kid-safe illustration style, clear silhouette, low detail, centered composition, and no text.`;
}

function upsertImgSource(categoryId, categoryName, spec, index, sourceKind, sourceOffset) {
  const promptKey = `${spec.key}:${sourceKind}`;
  const promptGroup = spec.titleEn;
  const sortOrder = index * 30 + sourceOffset;
  const title = `${categoryName} - ${promptGroup} - ${sourceKind === "outline" ? "Outline Source" : sourceKind === "scene_color" ? "Scene Color Source" : "Color Source"}`;
  const timestamp = now();

  const existing = db
    .prepare("SELECT id FROM img_sources WHERE category_id = ? AND prompt_key = ? LIMIT 1")
    .get(categoryId, promptKey);

  const values = [
    sourceKind,
    title,
    null,
    promptGroup,
    buildPromptZh(spec.titleZh),
    buildPromptEn(categoryName, spec.titleEn, sourceKind),
    sortOrder,
    1,
    timestamp,
  ];

  if (existing) {
    db.prepare(
      `UPDATE img_sources
       SET source_kind = ?, title = ?, description = ?, prompt_group = ?,
           prompt_text_zh = ?, prompt_text_en = ?, sort_order = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
    ).run(...values, existing.id);
    return existing.id;
  }

  const result = db
    .prepare(
      `INSERT INTO img_sources (
        category_id, image_url, local_file_path, title, description, sort_order, is_active,
        created_at, updated_at, source_kind, generated_img_ids, prompt_key, prompt_group,
        prompt_text_zh, prompt_text_en
      ) VALUES (?, '', '', ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
    )
    .run(
      categoryId,
      title,
      null,
      sortOrder,
      1,
      timestamp,
      timestamp,
      sourceKind,
      promptKey,
      promptGroup,
      buildPromptZh(spec.titleZh),
      buildPromptEn(categoryName, spec.titleEn, sourceKind),
    );
  return result.lastInsertRowid;
}

function upsertPose(categoryId, spec, index, sourceIds) {
  const timestamp = now();
  const existing = db
    .prepare("SELECT id FROM img_source_poses WHERE category_id = ? AND pose_key = ? LIMIT 1")
    .get(categoryId, spec.key);

  const values = [
    spec.titleEn,
    spec.titleZh,
    index * 30,
    sourceIds.color,
    "",
    "",
    null,
    sourceIds.outline,
    "",
    "",
    null,
    sourceIds.scene_color,
    "",
    "",
    null,
    timestamp,
    timestamp,
  ];

  if (existing) {
    db.prepare(
      `UPDATE img_source_poses
       SET pose_title = ?, pose_title_zh = ?, sort_order = ?,
           color_source_id = ?, color_image_url = ?, color_local_file_path = ?, color_generated_img_ids = ?,
           outline_source_id = ?, outline_image_url = ?, outline_local_file_path = ?, outline_generated_img_ids = ?,
           scene_color_source_id = ?, scene_color_image_url = ?, scene_color_local_file_path = ?, scene_color_generated_img_ids = ?,
           created_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(...values, existing.id);
    return;
  }

  db.prepare(
    `INSERT INTO img_source_poses (
      category_id, pose_key, pose_title, pose_title_zh, sort_order,
      color_source_id, color_image_url, color_local_file_path, color_generated_img_ids,
      outline_source_id, outline_image_url, outline_local_file_path, outline_generated_img_ids,
      scene_color_source_id, scene_color_image_url, scene_color_local_file_path, scene_color_generated_img_ids,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(categoryId, spec.key, ...values);
}

const updateCategory = db.prepare(
  `UPDATE categories
   SET pose_prompt_specs = ?,
       sync_status = CASE WHEN sync_status = 'synced' THEN 'pending_update' ELSE sync_status END,
       updated_at = ?,
       local_updated_at = ?
   WHERE id = ?`,
);

const transaction = db.transaction(() => {
  const changed = [];
  for (const [slug, items] of Object.entries(specsBySlug)) {
    const category = db
      .prepare(
        "SELECT id, name, pose_prompt_specs FROM categories WHERE slug = ? AND deleted_at IS NULL LIMIT 1",
      )
      .get(slug);

    if (!category) {
      console.log(`missing category: ${slug}`);
      continue;
    }
    if (String(category.pose_prompt_specs || "").trim()) {
      console.log(`skip existing: ${slug}`);
      continue;
    }

    const specs = buildSpecs(items);
    const timestamp = now();
    updateCategory.run(JSON.stringify(specs), timestamp, timestamp, category.id);

    specs.forEach((spec, index) => {
      const sourceIds = {
        color: upsertImgSource(category.id, category.name, spec, index, "color", 0),
        outline: upsertImgSource(category.id, category.name, spec, index, "outline", 1),
        scene_color: upsertImgSource(category.id, category.name, spec, index, "scene_color", 2),
      };
      upsertPose(category.id, spec, index, sourceIds);
    });

    changed.push(`${category.name} (${slug})`);
  }
  return changed;
});

const changed = transaction();
console.log(`updated ${changed.length} categories`);
for (const item of changed) console.log(`- ${item}`);
