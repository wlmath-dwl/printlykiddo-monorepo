import type { ImgSourceListItem } from "@/lib/admin-types";

function extractTitleZhFromPrompt(record: ImgSourceListItem) {
  const promptZh = record.prompt_text_zh?.trim() || "";
  if (promptZh.startsWith("绘制") && promptZh.endsWith("姿态的图")) {
    return promptZh.slice(2, -4).trim();
  }
  if (promptZh.startsWith("绘制") && promptZh.endsWith("主体图")) {
    return promptZh.slice(2, -"主体图".length).trim();
  }

  const zhMatch = promptZh.match(/【([^/\]]+)\s*\/\s*([^\]]+)】/u);
  if (zhMatch?.[1]?.trim()) {
    return zhMatch[1].trim();
  }

  const promptEn = record.prompt_text_en?.trim() || "";
  const enMatch = promptEn.match(/\[([^\]/]+)\s*\/\s*([^\]]+)\]/u);
  if (enMatch?.[2]?.trim()) {
    return enMatch[2].trim();
  }

  return "";
}

function sanitizeSceneColorPrompt(prompt: string) {
  return `${prompt
    .replaceAll("让画面适合后续制作网格拼图；也就是说，不同网格切块里都应尽量有可识别的颜色区域、轮廓区域或场景区域，而不是大片空白。", "让整张画面各区域都尽量有可识别的颜色区域、轮廓区域或场景区域，而不是大片空白。")
    .replaceAll("让整张图干净、稳定、适合打印和拼图。", "让整张图干净、稳定、适合打印。")
    .replaceAll("整体视觉目标应接近“儿童拼图底图 / 儿童场景彩图”：", "整体视觉目标应接近“完整儿童场景彩图”：")
    .replaceAll("The background must genuinely contribute to the composition so the image is suitable for later grid-puzzle use. Different grid tiles should contain recognizable color areas, shape areas, or scene content instead of large empty blanks.", "The background must genuinely contribute to the composition so that different areas of the image contain recognizable color regions, shape regions, or scene content instead of large empty blanks.")
    .replaceAll("so the whole image stays clean, stable, printable, and puzzle-friendly.", "so the whole image stays clean, stable, and printable.")
    .replaceAll("The overall result should feel like a children's puzzle base illustration or children's scene artwork:", "The overall result should feel like one complete children's scene illustration:")}\n\n阴影控制硬约束：默认不要阴影。不要地面投影、物体投影、接触阴影、空气感渐变阴影、柔光明暗、边缘压暗、体积塑造阴影、戏剧性打光或任何会让画面变脏变灰的阴影处理。只有在极少数确实影响主体或前后层级识别的情况下，才允许使用非常轻、非常少、非常平的两色块式明暗区分；这种区分必须仍然读起来像纯色块插画，而不是光影渲染。\n\nShadow control hard rule: avoid shadows by default. No ground shadows, cast shadows, contact shadows, soft airbrushed shading, edge darkening, volume-modeling shadows, dramatic lighting, or any shadow treatment that makes the image look muddy or gray. Only in rare cases where recognition would otherwise suffer may you use an extremely light, minimal, flat two-tone value separation; it must still read as solid-shape illustration rather than rendered lighting.\n\n严禁出现网格线、拼图切缝、拼图块轮廓、分块辅助线、裁切线、版式边框线或任何后期加工指示线。最终结果必须是一张完整、连续、未被切分的带背景彩图原始图。\n\nDo not include any grid lines, puzzle cut seams, puzzle-piece outlines, segmentation guides, crop guides, panel dividers, or any other production/helper lines. The final result must be one complete, continuous, unsegmented full-background colored source image.`;
}

function sanitizeSingleSubjectColorPrompt(prompt: string) {
  const normalized = prompt
    .replaceAll(
      "Create one simple colored single-subject illustration for a children's printable resource set.",
      "Create one simple colored cartoon illustration for a children's printable resource set.",
    )
    .replaceAll(
      "整体风格必须与上方封面图一致：以儿童打印资源站主风格为准，优先清晰、低复杂度、纯色块、打印友好的简化彩图，只少量吸收绘本插画里的自然结构感，不要吸收绘本阴影感、细腻体积感和额外细节。",
      "整体风格必须首先读起来像“儿童卡通打印插画”，而不是写实动物插画、半写实绘本插画或自然观察图。必须与上方封面图一致：以儿童打印资源站主风格为准，优先清晰轮廓、低复杂度、纯色块、强识别、强打印可读性。即使需要保留少量物种识别特征，也必须优先让整体呈现明确的儿童卡通感。",
    )
    .replaceAll(
      "Borrow only a small amount of natural structure from picture-book illustration, but do not borrow picture-book shading, soft volume rendering, or extra detail.",
      "This must read first as a children's cartoon printable illustration. Only keep a tiny amount of natural structure when necessary for recognition, but do not borrow picture-book realism, picture-book shading, soft volume rendering, or extra detail.",
    )
    .replaceAll(
      "主体比例必须是“自然简化比例”，更接近儿童绘本/认知卡片中的简化自然造型，不要 Q 版，不要大头小身，不要头部夸张放大，不要四肢过短，不要婴儿化比例，不要玩具感、吉祥物感或贴纸图标感。",
      "主体比例必须是“明确卡通化后的自然简化比例”，更接近儿童卡通认知卡片，而不是写实动物结构图。不要 Q 版，不要大头小身，不要头部夸张放大，不要四肢过短，不要婴儿化比例，但也不要把解剖结构保留得过于真实。若“更真实”和“更卡通”发生冲突，优先选择更卡通。",
    )
    .replaceAll(
      "The subject proportions must stay naturally simplified, closer to a simplified children's picture-book or learning-card illustration.",
      "The subject proportions must stay clearly cartoonized and naturally simplified, closer to a children's cartoon learning-card illustration.",
    )
    .replaceAll(
      "Keep the face simple and friendly, but base the facial features on simplified real structure rather than a cartoon template.",
      "Keep the face simple and friendly, but prioritize children's cartoon readability over realistic structure.",
    )
    .replaceAll(
      "Keep the eyes simple, friendly, and child-readable, but let the simplified eye shape still reflect the animal's more natural eye character, such as rounder, more oval, more almond-shaped, narrower, or slightly directional eye shapes depending on the subject. Keep the treatment low-detail and consistent with the species feel.",
      "Keep the eyes simple, friendly, child-readable, and clearly cartoonized. The eye shape may loosely reflect the species feel, but it must stay low-detail and non-realistic.",
    )
    .replaceAll(
      "整体应低复杂度、易识别、轮廓清晰、纯色块明确，同时比图标风更自然，适合儿童打印资源使用。",
      "整体应低复杂度、易识别、轮廓清晰、纯色块明确、强儿童卡通感、非写实、非半写实，适合儿童打印资源使用。",
    )
    .replaceAll(
      "Generate one low-complexity colored image for this pose direction so it looks clearly different from the other pose variants of the same topic while remaining fully consistent with the category cover artwork, with clear black contours, solid color fills, a more natural simplified picture-book feel, and suitability for printable kids activities.",
      "Generate one low-complexity children's cartoon colored image for this pose direction so it looks clearly different from the other pose variants of the same topic while remaining fully consistent with the category cover artwork, with clear black contours, flat bright colors, obvious cartoon shape design, and suitability for printable kids activities.",
    );

  return `${normalized}

主要风格目标：
这张图必须首先被看作“儿童卡通打印插画”，而不是写实动物图、半写实绘本图或自然观察图。

强制负面约束：
- 不要写实
- 不要半写实
- 不要照片感
- 不要真实毛发层次
- 不要细密毛发纹理
- 不要绘画笔触
- 不要柔和体积塑造
- 不要真实解剖刻画
- 不要电影感光影
- 不要戏剧性阴影
- 不要地面投影
- 不要接触阴影
- 不要边缘压暗
- 不要空气刷阴影
- 不要真实高光
- 不要材质纹理
- 不要写实眼睛
- 不要绘本写实感
- 不要水彩感
- 不要油画感
- 不要 3D 渲染感

卡通优先原则：
- 优先儿童卡通造型，而不是追求真实结构
- 使用更圆润、更友好、更简洁的 2D 造型
- 在保证可识别的前提下，明确把主体卡通化
- 若真实物种结构与卡通简化发生冲突，优先卡通简化
- 画面必须一眼看上去是儿童卡通图，而不是更自然更写实的插画。

阴影控制硬约束：
- 默认完全不要阴影
- 不要脚下阴影
- 不要身体下方阴影
- 不要投射到背景上的阴影
- 不要用深浅渐变来塑造体积
- 不要做成脏灰、发闷、偏写实的明暗效果
- 只有在极少数确实影响结构识别时，才允许使用非常轻、非常少、非常平的两色块式明暗区分
- 即使出现极轻微明暗区分，整体也必须仍然读起来像纯色块儿童卡通插画，而不是光影渲染图

Shadow control hard rules:
- avoid shadows completely by default
- no shadow under the feet or body
- no cast shadow falling onto the background
- no gradient-based volume shading
- do not let the image become muddy, gray, or semi-realistic through dark-light rendering
- only in rare cases where recognition truly suffers may you use an extremely light, minimal, flat two-tone value separation
- even then, the result must still read as flat children's cartoon artwork, not rendered lighting.

主体完整性硬约束：
- “一个主体”必须是一个完整、连续、正常可读的单体结构
- 若主体是动物，只能有一个头、一个口鼻部、一个颈部、一个躯干、一个尾巴和正常数量的四肢
- 不要双头
- 不要第二张脸
- 不要额外口鼻
- 不要额外尾巴
- 不要额外腿脚
- 不要分离身体部件
- 不要镜像重复部位
- 不要连体结构
- 不要尾巴、臀部、背部或耳朵长成像第二个头或第二个主体的形状
- 视觉差异只能来自姿态、朝向和整体外形变化，不能来自额外器官、重复部位或异常变形

Body integrity hard constraints:
- “One subject” must mean one complete, continuous, anatomically readable single body
- If the subject is an animal, it must have exactly one head, one muzzle, one neck, one torso, one tail, and the normal number of four legs
- no duplicate head
- no second face
- no extra muzzle
- no extra tail
- no extra legs or paws
- no detached body parts
- no mirrored repeated parts
- no conjoined anatomy
- do not let the tail, hips, back, or ears form a second-head-like or second-subject-like shape
- visual variation must come only from pose, orientation, and overall body shape, never from extra anatomy, repeated parts, or malformed structure`;
}

export function getEffectivePromptTextForImgSource(record: ImgSourceListItem) {
  const prompt =
    record.prompt_text_en?.trim() || record.prompt_text_zh?.trim() || "";

  if (!prompt) {
    return "";
  }

  if (record.source_kind === "scene_color") {
    return sanitizeSceneColorPrompt(prompt);
  }

  if (record.source_kind === "color") {
    return sanitizeSingleSubjectColorPrompt(prompt);
  }

  return prompt;
}

export function getEffectiveEnglishPromptTextForImgSource(record: ImgSourceListItem) {
  const prompt = record.prompt_text_en?.trim() || "";

  if (!prompt) {
    return "";
  }

  if (record.source_kind === "scene_color") {
    return sanitizeSceneColorPrompt(prompt);
  }

  if (record.source_kind === "color") {
    return sanitizeSingleSubjectColorPrompt(prompt);
  }

  return prompt;
}

export function getCopyPromptTextForImgSource(record: ImgSourceListItem) {
  const titleZh = extractTitleZhFromPrompt(record);
  if (titleZh) {
    return `绘制${titleZh}姿态的图`;
  }
  return "";
}
