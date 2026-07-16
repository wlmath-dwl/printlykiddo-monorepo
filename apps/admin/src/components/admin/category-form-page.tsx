"use client";

import {
  buildPendingCategoryImagePath,
  getCategoryImageFileName,
} from "@/lib/category-image";
import {
  App,
  Form,
  Button,
  Card,
  Divider,
  Input,
  InputNumber,
  Image,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Tag,
  Tabs,
  Typography,
  Upload,
  message,
} from "antd";
import { ExclamationCircleFilled, UploadOutlined } from "@ant-design/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { UploadProps } from "antd/es/upload/interface";

import type {
  ActiveListItem,
  CategoryRecord,
  ImgListItem,
  ImgSourceListItem,
} from "@/lib/admin-types";
import {
  replaceGeneratedCutImgsWithClientOutput,
} from "@/lib/category-cutout-client";
import { ImgSourcesManager } from "@/components/admin/img-sources-manager";
import {
  buildOutlineVariantPrompt,
  buildSceneColorVariantPrompt,
} from "@/lib/google-image-variant-test";
import {
  getRoadVehiclePosePromptInstruction,
  isRoadVehicleTheme,
} from "@/lib/pose-prompt-presets";

type CategoryFormValues = {
  parent_id?: number | null;
  name: string;
  slug?: string;
  description?: string;
  /** 仅本地，不同步远端 */
  name_zh?: string;
  /** 仅本地，不同步远端；用于生成前台英文文案提示词 */
  pose_prompt_specs?: string | null;
  cover_image?: string;
  seo_image_url?: string;
  sort_order: number;
  is_active: boolean;
  publish_to_pin?: boolean;
};

type CategoryFormPageProps = {
  categoryId?: number;
  initialFlat: CategoryRecord[];
  activeItems: ActiveListItem[];
  availableActives: string[];
  initialValues: CategoryFormValues;
  backHref?: string;
  lockParentSelection?: boolean;
};

type GeneratedUploadPreset =
  | "cover"
  | "generated_cover"
  | "generated_card"
  | "generated_pdf";

type ActiveListResponse = {
  items: ActiveListItem[];
};

type ImgSourceListResponse = {
  items: ImgSourceListItem[];
};

type GenerateAllImgResponse = {
  items?: ImgListItem[];
  generated_count?: number;
  drafted_count?: number;
  deleted_count?: number;
  error?: string;
};

function buildCoverPromptTheme(theme?: string) {
  return theme?.trim() || "在此填入主题";
}

function buildCoverSubjectStrategy(input: {
  theme: string;
  level: number;
  ancestors?: string[];
}) {
  const context = [input.theme, ...(input.ancestors ?? [])].join(" ").toLowerCase();

  if (input.level === 1) {
    if (/(animal|animals|动物)/.test(context)) {
      return {
        chinese:
          "一级动物类封面必须只使用一个动物主体，不能出现多个动物拼图、群像、头像拼贴或一张图里并列展示多种动物。这个主体应当是“动物世界入口”的代表物，而不是过于偏某个小子类的冷门动物。优先选择大象、狮子、长颈鹿、熊这类识别度高、儿童一眼能认出的代表性动物；若工具需要你自行决定，请优先选其中一种。不要让画面看起来像某个三级物种详情图，也不要做成动物大合集海报。",
        english:
          "For a top-level Animals cover, use exactly one animal subject only. Do not show multiple animals, group portraits, face collages, or a lineup of different species. The subject should feel like a broad entrance to the animal world rather than a narrow niche species. Prefer a highly recognizable representative animal such as an elephant, lion, giraffe, or bear. If you must choose one yourself, prefer one of those. Do not make it look like a species-detail illustration or an animal collection poster.",
      };
    }

    if (/(machine|machines|vehicle|vehicles|机械|机器|交通工具)/.test(context)) {
      return {
        chinese:
          "一级机械类封面必须只使用一个主体，不能把汽车、卡车、火箭、挖掘机等多个对象拼在一起。请选择一个最有代表性、轮廓最清楚、儿童最容易识别的机械或交通工具主体，做成“机械世界入口”封面，而不是多个细分类的大杂烩。",
        english:
          "For a top-level Machines cover, use exactly one subject only. Do not combine cars, trucks, rockets, excavators, or multiple machine types in one image. Choose one highly representative, easy-to-recognize machine or vehicle-like subject with a strong silhouette, so the result feels like a clear entrance to the machines world rather than a mixed collage of subcategories.",
      };
    }

    if (/(dinosaur|dinosaurs|恐龙)/.test(context)) {
      return {
        chinese:
          "一级恐龙类封面必须只使用一个恐龙主体，不能把多种恐龙拼在一起。应选择一个儿童最熟悉、轮廓鲜明、能代表“恐龙世界入口”的经典恐龙主体。",
        english:
          "For a top-level Dinosaurs cover, use exactly one dinosaur subject only. Do not combine multiple dinosaur species. Choose one classic, highly recognizable dinosaur with a strong silhouette that feels like an entrance to the dinosaur world.",
      };
    }

    if (/(plant|plants|flower|tree|植物|花|树)/.test(context)) {
      return {
        chinese:
          "一级植物类封面必须只使用一个植物主体，不要同时拼很多花、叶、树或果实。应选择一个形状明确、识别度高、最能代表“植物类入口”的单一植物主体。",
        english:
          "For a top-level Plants cover, use exactly one plant subject only. Do not combine many flowers, leaves, trees, or fruits together. Choose one clear, highly recognizable plant subject that best represents the plants category as a whole.",
      };
    }

    if (/(food|foods|drink|drinks|食物|食品|饮料)/.test(context)) {
      return {
        chinese:
          "一级食物类封面必须只使用一个食物主体，不要做成餐盘大合集或把多种食物拼在一起。应选择一个儿童最容易识别、形状简洁、代表性强的单一食物主体。",
        english:
          "For a top-level Food cover, use exactly one food subject only. Do not turn it into a mixed plate or a collection of many foods. Choose one simple, highly recognizable, representative food subject.",
      };
    }

    if (/(space|rocket|planet|太空|宇宙|火箭|星球)/.test(context)) {
      return {
        chinese:
          "一级太空类封面必须只使用一个太空主体，不要把火箭、星球、宇航员、飞船同时拼在一张图里。应选择一个最能代表太空主题入口的单一主体。",
        english:
          "For a top-level Space cover, use exactly one space subject only. Do not combine a rocket, planet, astronaut, and spaceship together in one image. Choose one single subject that best represents the space theme as a category entrance.",
      };
    }

    return {
      chinese:
        "一级分类封面必须只使用一个代表性主体，不要把多个对象拼在一起，不要做成图标集合、海报式拼贴或样本列表。应选择一个最能代表整个大类方向的单一主体，做成“总入口封面”。",
      english:
        "A top-level category cover must use exactly one representative subject only. Do not combine multiple objects, create an icon collection, a poster-like collage, or a sample lineup. Choose one single subject that best represents the overall category direction.",
    };
  }

  if (input.level === 2) {
    return {
      chinese:
        "二级分类封面也必须只使用一个主体，不要把多个该子类成员并排展示。应选择一个最能代表该二级子主题的单一主体，让用户一眼知道这个分支大概是什么，但不要画成三级详情图那样过于狭窄。",
      english:
        "A second-level category cover must also use exactly one subject only. Do not line up several members of the subcategory. Choose one single subject that best represents this branch so users instantly understand the subtheme, while still feeling slightly broader than a level-three detail cover.",
    };
  }

  return {
    chinese:
      "三级分类封面必须只画当前主题本身的单一主体，不要加入第二个主体，不要做成同类集合，也不要用别的对象来代替当前主题。",
    english:
      "A third-level category cover must depict one single subject that matches the exact topic itself. Do not add a second subject, do not turn it into a same-type collection, and do not substitute the topic with a different object.",
  };
}

function getRepresentativeSubject(input: {
  theme: string;
  level: number;
  ancestors?: string[];
}) {
  const theme = input.theme.trim();
  const context = [theme, ...(input.ancestors ?? [])].join(" > ").toLowerCase();
  const normalizedTheme = theme.toLowerCase();

  if (input.level === 2) {
    const secondLevelMappings: Array<{ test: RegExp; subject: string; reason: string }> = [
      {
        test: /family holidays?/i,
        subject: "one cozy family holiday camper van",
        reason:
          "It turns the abstract idea of family holidays into one concrete, child-readable travel object without drawing a family group, collage, or full vacation scene.",
      },
      {
        test: /halloween/i,
        subject: "one pumpkin candy bucket",
        reason: "It is a single, iconic Halloween object with a strong silhouette and printable-card readability.",
      },
      {
        test: /easter/i,
        subject: "one Easter basket with eggs",
        reason: "It represents Easter activities as one contained object instead of a multi-item scene.",
      },
      {
        test: /summer holidays?|summer vacation/i,
        subject: "one beach suitcase with a sun hat",
        reason: "It suggests summer travel through one compact object cluster, not a beach scene.",
      },
      {
        test: /winter holidays?|christmas/i,
        subject: "one cozy holiday cabin",
        reason: "It gives winter holidays a single readable representative object without requiring multiple people or decorations.",
      },
    ];
    const matched = secondLevelMappings.find((item) => item.test.test(normalizedTheme));
    if (matched) {
      return matched;
    }
  }

  if (/holiday|holidays|vacation|festival|celebration/.test(context)) {
    return {
      subject: `one representative object for "${theme}"`,
      reason:
        "This is an abstract holiday category, so first choose one concrete object with the clearest thumbnail silhouette instead of showing people, multiple symbols, or a scene.",
    };
  }

  return {
    subject: `one concrete representative subject for "${theme}"`,
    reason:
      "Choose the single subject that best represents this category while staying broader than a narrow detail page.",
  };
}

function getCategoryLevelCoverRole(level: number) {
  if (level === 1) {
    return {
      chinese: "一级主类封面",
      english: "top-level category cover",
      chineseInstruction:
        "这是一个更宽泛的一级分类封面，目标是代表整个主题方向，而不是某个过于具体的小对象。",
      englishInstruction:
        "This is a broader top-level category cover. It should represent the overall theme, not a narrow or overly specific object.",
    };
  }

  if (level === 2) {
    return {
      chinese: "二级子类封面",
      english: "second-level subcategory cover",
      chineseInstruction:
        "这是一个二级分类封面，应该比一级更聚焦，但仍需保留“子主题代表图”的概括性。",
      englishInstruction:
        "This is a second-level subcategory cover. It should be more focused than a top-level category, while still feeling representative rather than overly literal.",
    };
  }

  return {
    chinese: "三级具体主题封面",
    english: "third-level topic cover",
    chineseInstruction:
      "这是一个三级具体主题封面，应使用一个最具代表性的单一主体，清晰、直接、识别度高。",
    englishInstruction:
      "This is a third-level specific topic cover. Use one highly recognizable central subject that is clear, direct, and instantly identifiable.",
  };
}

function buildCoverPromptTexts(input: {
  theme?: string;
  level: number;
  ancestors?: string[];
}) {
  const normalizedTheme = buildCoverPromptTheme(input.theme);
  const levelRole = getCategoryLevelCoverRole(input.level);
  const subjectStrategy = buildCoverSubjectStrategy({
    theme: normalizedTheme,
    level: input.level,
    ancestors: input.ancestors,
  });
  const ancestorPath =
    input.ancestors && input.ancestors.length > 0
      ? input.ancestors.join(" > ")
      : "（无上级路径）";
  const representative = getRepresentativeSubject({
    theme: normalizedTheme,
    level: input.level,
    ancestors: input.ancestors,
  });

  const chinesePrompt = `请为 PrintlyKiddo 生成一张【${levelRole.chinese}】封面图，用于网站分类导航卡片和页头。

Category Subject Planning
- 当前主题：${normalizedTheme}
- 分类路径：${ancestorPath}
- 代表主体决策：请画【${representative.subject}】。
- 决策原因：${representative.reason}
- ${levelRole.chineseInstruction}
- ${subjectStrategy.chinese}

Rendering Rules
- 画面只允许一个清晰主主体。不要画群像、拼贴、多个符号合集、旅行场景、节日装饰大集合或样本列表。
- 主体居中，1:1 正方形画布，纯白背景，适合分类缩略图；主体约占画面 65%–80%，四周留白均衡，不裁切。
- 视觉风格：儿童 printable 资源站封面图，清晰黑色外轮廓、纯色块、低复杂度、现代、友好、高清可打印。
- 主体要有真实插画感和自然简化结构，不要做成扁平 UI icon、logo、贴纸、吉祥物、Q 版大头或表情包角色。
- 内部细节只保留识别必需的大形体和少量关键分区线，避免碎线、密集纹理、复杂阴影、渐变、噪点、材质和写实光影。
- 如果主题很抽象，请坚持使用上面的代表主体，不要自行改成一家人、多人旅行、完整室内外场景或节日 collage。

Output
Generate one polished, centered, printable-friendly color illustration with no text and no watermark.`;

  const englishPrompt = `Create a ${levelRole.english} illustration for PrintlyKiddo, used as a website category navigation card and page header.

Category Subject Planning
- Theme: ${normalizedTheme}
- Category path: ${ancestorPath}
- Representative subject decision: draw [${representative.subject}].
- Decision reason: ${representative.reason}
- ${levelRole.englishInstruction}
- ${subjectStrategy.english}

Rendering Rules
- Use exactly one clear main subject. Do not create a group portrait, collage, symbol collection, travel scene, holiday decoration set, or sample lineup.
- Center the subject on a strict 1:1 square canvas with a pure white background. It must read well as a small category thumbnail. Let the subject fill about 65%–80% of the frame with balanced margins and no cropping.
- Visual style: children's printable resource cover art, crisp black outer contour, solid color fills, low complexity, modern, friendly, and high-resolution print readability.
- The subject should feel like a real simplified illustration, not a flat UI icon, logo, sticker, mascot, chibi character, big-head character, or meme-like face.
- Keep only the large readable forms and a few necessary internal separation lines. Avoid dense small lines, busy textures, realistic lighting, gradients, heavy shadows, noise, material rendering, and painterly effects.
- If the category is abstract, keep the representative subject above. Do not reinterpret it as a family group, multi-person vacation, full indoor/outdoor scene, or holiday collage.

Output
Generate one polished, centered, printable-friendly color illustration with no text and no watermark.`;

  return {
    chinese: chinesePrompt,
    english: englishPrompt,
  };
}

function buildSeoMainImagePromptTexts(input: {
  theme?: string;
  level: number;
  ancestors?: string[];
}) {
  const normalizedTheme = buildCoverPromptTheme(input.theme);
  const levelRole = getCategoryLevelCoverRole(input.level);
  const subjectStrategy = buildCoverSubjectStrategy({
    theme: normalizedTheme,
    level: input.level,
    ancestors: input.ancestors,
  });
  const ancestorPath =
    input.ancestors && input.ancestors.length > 0
      ? input.ancestors.join(" > ")
      : "（无上级路径）";
  const representative = getRepresentativeSubject({
    theme: normalizedTheme,
    level: input.level,
    ancestors: input.ancestors,
  });
  const subjectDecisionZh =
    input.level === 3
      ? `请画【一个准确匹配 "${normalizedTheme}" 的清晰单主体】。`
      : `请画【${representative.subject}】。`;
  const subjectDecisionEn =
    input.level === 3
      ? `Draw one clear single subject matching "${normalizedTheme}" exactly.`
      : `Draw [${representative.subject}].`;
  const subjectReasonZh =
    input.level === 3
      ? "三级页面主图需要直接代表当前具体主题，因此优先画当前主题本身的单个主体。"
      : representative.reason;
  const subjectReasonEn =
    input.level === 3
      ? "A third-level page main image should directly represent the exact topic, so use one single subject of the current topic itself."
      : representative.reason;

  const chinesePrompt = `请为 PrintlyKiddo 生成一张【${levelRole.chinese}】OG / 页面主图，用于 Google 搜索结果图片、og:image、twitter:image、结构化数据、sitemap image，以及页面顶部主图展示。

Category Subject Planning
- 当前主题：${normalizedTheme}
- 分类路径：${ancestorPath}
- 主体决策：${subjectDecisionZh}
- 决策原因：${subjectReasonZh}
- ${levelRole.chineseInstruction}
- ${subjectStrategy.chinese}

Important Composition Decision
- 默认只画一个清晰、完整、居中的代表主体，不要画多个主体、多个同类成员、分类合集、图标矩阵、拼贴海报或完整故事场景。
- 如果主题是抽象的二级类型，也要先把它转成一个最有代表性的单一可视主体；最多允许这个主体自带极少量不可拆分的小配件，但整体仍必须读作一个主物件，而不是多个并列对象。
- 这张图会在 Google 链接预览和页面顶部使用，因此缩小后必须一眼能识别，不要依赖细小装饰、背景叙事或文字说明。

Rendering Rules
- 输出严格 1:1 正方形画布，建议 1024×1024 或更高；无文字、无水印、无 logo。
- 主体居中，约占画面 60%–78%，四周留白均衡，不裁切，不贴边，适合搜索结果缩略图和网页页头。
- 背景使用纯白或极浅、干净的单色背景；不要复杂背景、场景铺陈、地面阴影、投影底座、渐变、纹理或光效。
- 风格与 PrintlyKiddo 主站素材一致：儿童 printable 资源站主图，清晰黑色外轮廓、干净纯色块、低复杂度、友好、现代、高清可打印。
- 主体要像自然简化的儿童卡通插画，不要做成扁平 UI icon、贴纸、吉祥物、Q 版大头、表情包角色、写实渲染或半写实绘本风。
- 只保留识别必需的大形体、关键颜色分区和少量内部结构线；避免碎线、密集纹理、复杂阴影、真实材质、高光反射、噪点和画笔笔触。
- 如果主体天然细长，可用自然姿态、轻微倾斜或温和转折让主形更适合方图，但不要过度卷曲、异常折叠或为了填满画面而变形。

Output
Generate one polished, centered, printable-friendly color main image that works both as a Google preview image and as the page-top hero image.`;

  const englishPrompt = `Create a ${levelRole.english} OG / page main image for PrintlyKiddo. It will be used for Google search result images, og:image, twitter:image, structured data, sitemap image, and the page-top main image.

Category Subject Planning
- Theme: ${normalizedTheme}
- Category path: ${ancestorPath}
- Subject decision: ${subjectDecisionEn}
- Decision reason: ${subjectReasonEn}
- ${levelRole.englishInstruction}
- ${subjectStrategy.english}

Important Composition Decision
- By default, draw exactly one clear, complete, centered representative subject. Do not create multiple subjects, a lineup of category members, an icon grid, a collage poster, or a full story scene.
- If this is an abstract second-level category, first translate it into one concrete representative visual subject. A few tiny inseparable accessories are acceptable only when they read as part of one main object, not as several separate objects.
- This image will appear in Google link previews and at the top of the page, so it must stay instantly recognizable when reduced. Do not rely on tiny decorations, background storytelling, or text labels.

Rendering Rules
- Output a strict 1:1 square canvas, preferably 1024x1024 or larger. No text, no watermark, no logo.
- Center the subject and let it fill about 60%–78% of the frame, with balanced margins, no cropping, and no edge-hugging composition. It should work as both a search thumbnail and a page header image.
- Use a pure white or very light clean solid background. No complex background, scene spread, ground shadow, shadow base, gradients, texture, or glow effects.
- Match PrintlyKiddo's visual language: children's printable resource main art, crisp black outer contour, clean solid color fills, low complexity, friendly, modern, and high-resolution print readability.
- The subject should feel like a naturally simplified children's cartoon illustration. Do not make it a flat UI icon, sticker, mascot, chibi big-head character, meme face, realistic rendering, or semi-realistic picture-book artwork.
- Keep only the large readable forms, key color areas, and a few necessary internal structure lines. Avoid tiny fragmented linework, dense texture, complex shading, realistic materials, specular highlights, noise, and brush strokes.
- For naturally elongated subjects, use a natural pose, slight tilt, or gentle turn to make the shape fit a square better, but do not over-curl, fold abnormally, or distort the subject just to fill the frame.

Output
Generate one polished, centered, printable-friendly color main image that works both as a Google preview image and as the page-top hero image.`;

  return {
    chinese: chinesePrompt,
    english: englishPrompt,
  };
}

void buildSeoMainImagePromptTexts;

function buildLegacyCoverPromptTexts(input: {
  theme?: string;
  level: number;
  ancestors?: string[];
}) {
  const normalizedTheme = buildCoverPromptTheme(input.theme);
  const levelRole = getCategoryLevelCoverRole(input.level);
  const subjectStrategy = buildCoverSubjectStrategy({
    theme: normalizedTheme,
    level: input.level,
    ancestors: input.ancestors,
  });
  const ancestorPath =
    input.ancestors && input.ancestors.length > 0
      ? input.ancestors.join(" > ")
      : "（无上级路径）";

  return {
    chinese: `请生成一张用于网站分类导航卡片与页头的【${levelRole.chinese}】插画，主题为【${normalizedTheme}】。分类层级路径参考：${ancestorPath}。${levelRole.chineseInstruction} ${subjectStrategy.chinese} 目标不是普通插画，而是“网站分类封面图”：要求缩小到小卡片时仍能一眼识别主体，轮廓强、信息集中、无多余道具或复杂场景。统一风格基准：以儿童打印资源站主风格为准，优先接近“清晰、低复杂度、纯色块、打印友好”的简化彩图风格，只少量吸收儿童绘本插画里的自然结构感，不要吸收绘本里的阴影感、细腻体积感和复杂细节。画布与背景要求：最终输出必须是严格的 1:1 正方形画布，不要横图，不要竖图；若工具支持尺寸参数，请直接按 1024×1024 输出。背景必须纯白，不要地面色块，不要投影底座，不要环境底纹，不要任何场景承托。构图要求：单一主视觉主体必须在正方形画布正中央形成清晰主视觉，四周留白要尽量均衡，不允许一侧出现大面积空白，不要做成长横幅式排布、贴边排布或偏到一侧的版式。绝对不要在一张封面里并列放两个或以上主体，不要做组图封面，不要做拼贴封面，不要做样本合集式封面。主体整体应主要落在画布中心区域，宽高都要保持可控，不要把主体过度横向拉长、纵向拉高或做成细长贯穿整张画面的形态。对于天然细长的主体，优先通过主体本身的自然姿态变化来提升纵向占比与主形集中度，例如轻微弯曲、轻微抬头、轻微抬尾、轻微倾斜、自然转折或温和的上下起伏；但这些变化必须保持主体原本合理、自然、可信的结构，不要为了适配正方形而强行夸张变形。不要出现不自然的过度卷曲、盘绕、螺旋尾部、夸张S弯、过度折叠、异常压缩或违背主体本身结构逻辑的变形。主体占画面约 65%–80%，不要裁切主体，不要远景，不要背景环境叙事。只有当主体天然在某一个方向特别长、且经过姿态调整后仍然出现极端大面积空白时，才允许补一个极简、很小、与主体风格一致的辅助场景或平衡元素，用来打破空白失衡；该元素必须贴近主体、集中在画面中间附近，不能抢主体，不能铺满画面，不能变成场景图，也不能成为第二视觉中心。若主体是动物或人物，优先轻侧身或 3/4 侧的自然角度；如使用正面，也不要完全对称、不要卡片式摆拍。风格要求：高品质儿童平涂卡通插画（适合 3–8 岁），极简、友好、现代、低复杂度，更接近儿童认知卡片里的自然简化插画，而不是吉祥物图标。比例要求：整体应为“自然简化比例”的儿童插画，不要 Q 版，不要大头小身，不要头部夸张放大，不要四肢过短，不要婴儿化比例，不要玩具感、吉祥物感或贴纸图标感；主体应保持清晰、稳定、较自然的简化体态。若是动物或人物，头身关系、躯干长度、四肢长度、站姿和身体重心都应接近真实结构的简化版本，不要僵硬站桩感。面部处理要克制、简洁、友好，五官应基于真实结构做简化，不要表情包感，不要过度卖萌，不要夸张嘴型，不要卡通模板脸，不要过强拟人化。技术要求：使用清晰、闭合、利落但不过分夸张的黑色外轮廓线，不要做成特别粗重、特别硬的图标化描边；内部只填充干净、明快、儿童友好的纯色块；不要渐变、不要明显阴影、不要高光反射、不要纹理、不要噪点、不要画笔笔触、不要复杂背景、不要文字、不要水印，不要任何形式的投影、光晕、镜面高光或发光效果。允许极少量用于结构表达的轻微转折线，但不能形成绘本上色阴影或真实体积塑造。请保持明显的彩图观感，不要做成黑白图、灰度图，不能让画面整体看起来只有黑白两色；如果主体天然偏黑白，也要用少量简洁辅助色让结果仍然是儿童彩图。内部结构尽量简化，只保留必要外轮廓和少量关键分区线，并继续减少重复内部轮廓层、连续细碎边缘、密集层叠小形、尖锐小突起和零碎装饰线。优先保留大形体、大色块、大轮廓关系，不要让大量小线条、小尖角、小碎块抢走主体识别度。整体要高对比、边缘 crisp、适合高清显示与印刷，并且明显适合作为分类封面缩略图。`,
    english: `Create a ${levelRole.english} illustration for a website category navigation card and page header. Theme: [${normalizedTheme}]. Category path context: ${ancestorPath}. ${levelRole.englishInstruction} ${subjectStrategy.english} This is not a generic illustration; it must work as a category cover image. The image must remain instantly recognizable at small thumbnail size, with a strong silhouette, concentrated information, and no unnecessary props or complex scene elements. Unified style baseline: follow the site's main printable-friendly visual language first, meaning clear contours, low complexity, solid color fills, and strong print readability. Borrow only a small amount of natural structure from children's picture-book illustration, but do not borrow picture-book shading, soft volume rendering, or extra detail. Canvas and background requirements: the final output must be a strict 1:1 square canvas. Do not generate a landscape or portrait image. If the tool supports dimensions, output at 1024x1024. The background must be pure white with no ground patch, no shadow base, no environmental texture, and no scene support elements. Composition: one central hero subject must form a clear focal point in the exact center of the square canvas, with balanced white space on all four sides. Do not leave a large empty area on only one side, and do not arrange the subject like a wide horizontal banner, edge-hugging layout, or off-center composition. Never place two or more main subjects in the same cover. Do not create a group cover, collage cover, lineup cover, or sample-sheet cover. The subject should stay mainly within the central area of the square canvas, with controlled width and height. Do not stretch the subject too far horizontally or vertically, and do not let it become a long narrow form spanning across the whole image. For naturally elongated subjects, first improve vertical presence and shape concentration through natural pose variation such as a gentle bend, slight head lift, slight tail lift, mild tilt, natural turn, or soft up-and-down flow. These changes must preserve the subject's own believable, natural structure. Do not distort the subject just to fit the square. Do not introduce unnatural over-curling, coiling, spiral tails, exaggerated S-curves, excessive folding, abnormal compression, or any deformation that breaks the subject's structural logic. The subject should fill about 65%–80% of the frame, with no subject cropping, no distant view, and no environmental storytelling. Only when the subject is naturally extremely long in one direction and still creates a very large empty area in the opposite direction after pose adjustment may you add one tiny, extremely simple balancing scene cue or supporting element. It must stay close to the subject, remain grouped near the center area, match the subject's style, and must not become dominant, spread across the image, turn the image into a scene illustration, or become a second focal point. For animals or characters, prefer a slight side view or three-quarter view with a natural stance; if front-facing, avoid a fully symmetrical card-like pose. Style: high-quality flat-color cartoon illustration for children ages 3–8, ultra-clean, modern, friendly, and low-complexity, closer to a simplified children's learning-card illustration than to a mascot icon. Proportion requirements: use simplified but still natural proportions. Do not make it chibi, super-deformed, kawaii mascot-like, baby-proportioned, sticker-icon-like, or toy-like. Do not enlarge the head excessively, do not shrink the body too much, and do not make the limbs unnaturally short. The subject should keep a clear, stable, naturally simplified body structure. For animals or characters, keep the head-body relationship, torso length, limb length, standing posture, and weight balance close to a simplified version of real anatomy rather than a stiff icon pose. Facial treatment should stay restrained, simple, and friendly. Facial features should be simplified from real structure rather than built from a cartoon face template. Avoid meme-like expression design, exaggerated cute-face treatment, exaggerated mouth shapes, template-like cartoon faces, and strong anthropomorphic styling. Technical requirements: use clear, closed, crisp black outer contours that are bold enough to read clearly but not overly thick, rigid, or icon-like; fill the interior only with clean, bright, child-friendly solid color shapes; no gradients, no obvious shading, no specular highlights, no textures, no grain, no brush strokes, no complex background, no text, no watermark, and no glow, halo, or ambient occlusion effects of any kind. A very small amount of structural contour indication is acceptable, but it must not turn into rendered shadows or realistic volume modeling. Keep a clearly colored illustration look; do not make it feel like a black-and-white image or grayscale artwork, and do not let the overall result read as only black and white. If the subject is naturally black-and-white, introduce a small amount of simple supporting color so the final result still feels like children's color artwork. Simplify interior structure aggressively and keep only the essential outer contour plus a small number of key separation lines, while further reducing repeated interior contour layers, continuous fragmented edges, dense stacks of tiny shapes, sharp tiny protrusions, and scattered decorative lines. Prioritize large readable forms, large color areas, and the main silhouette relationship. Do not let many tiny lines, sharp corners, or fragmented details compete with the subject's recognizability. The final result should be high-contrast, crisp-edged, print-friendly, and clearly suitable as a category cover thumbnail.`,
  };
}

void buildLegacyCoverPromptTexts;

/** 三级分类封面旁「线框转化」弹窗固定文案（基于参考图转线稿） */
const LINE_ART_CONVERSION_PROMPTS = {
  chinese:
    "[一张高品质的黑白线稿图，基于参考图转换]。 请执行以下操作：去除所有颜色，仅保留与参考图一致的核心轮廓和必要结构线。线条应清晰、闭合、顺滑、黑色、打印友好，不要做成特别粗重、特别硬的图标化描边。保留参考图原本的自然简化结构、自然站姿和主体比例，不要改成 Q 版、吉祥物感或模板卡通脸。内部完全留白，无任何颜色填充、渐变、阴影、高光、纹理或体积塑造，不要任何形式的光影效果。最终输出优先为严格 1:1 正方形画布；若参考图本身不是正方形，请将主体完整居中放入纯白正方形画布中，保证四周留白尽量均衡，不要裁切主体，不要偏到某一侧，不要添加地面色块、投影底座或场景元素。继续减少所有细小、重复、尖锐或密集的内部线条。保持与参考图尽量一致的构图和主体姿态。专为儿童涂色练习和高清打印设计。",
  english:
    "[A high-quality black and white line art conversion, based on the reference image]. Execute commands: Remove ALL colors and keep only the core contours and necessary structure lines consistent with the reference image. Linework should be clear, closed, smooth, black, and print-friendly, but not overly thick, rigid, or icon-like. Preserve the reference image's naturally simplified structure, natural stance, and subject proportions. Do not turn it into chibi style, a mascot-like design, or a template cartoon face. Keep the interior completely empty with NO color fill, NO gradients, NO shading, NO highlights, NO texture, NO volume rendering, and NO lighting effects of any kind. Prefer a strict 1:1 square canvas for the final output; if the reference image is not square, place the complete subject centered inside a pure white square canvas with balanced margins on all sides, without cropping, and do not add any ground patch, shadow base, or scene elements. Further reduce all tiny, repeated, sharp, or dense interior lines. Maintain the composition and pose as closely as possible to the reference image. Designed for children's coloring exercises and HD printing.",
} as const;

/** 从一级到直属父级的英文名称链 */
function collectAncestorNames(
  parentId: number | null,
  categoryMap: Map<number, CategoryRecord>,
) {
  const chain: string[] = [];
  let id = parentId;
  while (id !== null) {
    const row = categoryMap.get(id);
    if (!row) {
      break;
    }
    chain.unshift(row.name);
    id = row.parent_id;
  }
  return chain;
}

/**
 * 供外部 AI 生成「前台英文文案」：PrintlyKiddo 分类页中与标题配套的说明句。
 * 产出内容写入本表单 description 字段（同步至 D1 后展示在页头）。
 */
function buildCategoryDescriptionAiPrompt(input: {
  level: number;
  name: string;
  nameZh: string;
  slug: string;
  ancestors: string[];
  availableActives: string[];
  poseTerms: string[];
}) {
  const name = input.name.trim() || "(category English name not filled yet)";
  const nameZh = input.nameZh.trim();
  const slug = input.slug.trim() || "(slug auto or not set)";
  const path =
    input.ancestors.length > 0
      ? input.ancestors.join(" > ")
      : "(parent chain unknown)";

  const levelName =
    input.level === 1
      ? "Main Theme (Top-level)"
      : input.level === 2
        ? "Sub-theme (Second-level)"
        : "Specific Topic (Third-level)";

  const levelInstruction =
    input.level < 3
      ? "- Since this is a broader category, describe the variety of resources or subtopics available here."
      : "- Since this is a specific topic, describe what kids will find in these specific pages.";

  const activitiesStr =
    input.availableActives.length > 0
      ? input.availableActives.join(", ")
      : "coloring pages, tracing, cut-outs, etc.";
  const poseTermsStr =
    input.poseTerms.length > 0
      ? input.poseTerms.join(", ")
      : "(none saved yet; infer only from the topic if needed)";
  const poseInstruction =
    input.level === 3
      ? `- IMPORTANT: This specific topic may have saved pose/object terms. If listed, cover EVERY term naturally and compactly in the sentence: ${poseTermsStr}.`
      : "- If no specific pose/object terms are listed, do not invent a long pose list; focus on the category's natural resource range.";

  return `You are writing short on-page copy for PrintlyKiddo (printlykiddo), a site that offers free printable PDF coloring pages and simple activity sheets for children (about ages 3–10), for home, classroom, and homeschool.

TASK
Write exactly ONE clear English sentence (about 180–320 characters; two short clauses OK if still one sentence). This sentence will be stored in the CMS field "description" for a Level ${input.level} category. On the live site it appears in the page header area next to the main heading (H1) for this topic, so it must be useful to visitors and strong for SEO.

CATEGORY CONTEXT (for you; output English only)
- Category Level: Level ${input.level} (${levelName})
- Topic display name (English, often used in H1): ${name}
- Local Chinese label (for disambiguation only; do not output Chinese): ${nameZh || "—"}
- URL slug segment: ${slug}
- Breadcrumb-style path: ${path}
- Available Activity Types in this category: ${activitiesStr}
- Saved Pose / Object Terms to Cover: ${poseTermsStr}

REQUIREMENTS
- Natural, parent- and teacher-friendly, written the way parents and teachers search.
- Include strong long-tail search language such as "free printable ${name}", "${name} coloring pages", "${name} tracing worksheets", "${name} cut out", "${name} puzzle", or "${name} number sequencing" when those functions are available.
- Cover EVERY available activity type naturally, using user-friendly words rather than internal labels when needed.
${poseInstruction}
- Plain text only: no HTML, no markdown, no leading/trailing quotes around the whole line.
- Do not merely repeat the topic name; combine the topic, pose/object terms, and activity/function terms into one readable SEO sentence.
- IMPORTANT: This page is a hub that contains multiple types of activities (e.g., ${activitiesStr}). Do NOT assume it is only for coloring.
- Avoid keyword stuffing, fake claims, sales language, and vague filler like "fun resources"; every phrase should help users understand what printable pages are included.
- Match a neutral US/UK tone; stay consistent within the sentence.
${levelInstruction}

OUTPUT
Return only the final English sentence, with no label or preamble.`;
}

type PosePromptSpec = {
  titleZh: string;
  titleEn: string;
};

type PosePromptVariant = PosePromptSpec & {
  key: string;
  chinesePrompt: string;
  englishPrompt: string;
};

type ImgSourcePromptPlan = {
  source_kind: "outline" | "color" | "scene_color";
  prompt_key: string;
  prompt_group: string;
  title: string;
  description: string | null;
  prompt_text_zh: string;
  prompt_text_en: string;
  sort_order: number;
  is_active: boolean;
};

const POSE_VARIANT_COUNT = 4;
const POSE_VARIANT_COUNT_GUIDANCE = `通常建议 1-${POSE_VARIANT_COUNT} 条`;

const SOURCE_PROMPT_NAME_META: Record<
  ImgSourcePromptPlan["source_kind"],
  {
    titleSuffix: string;
  }
> = {
  color: {
    titleSuffix: "Color Source",
  },
  outline: {
    titleSuffix: "Outline Source",
  },
  scene_color: {
    titleSuffix: "Scene Color Source",
  },
};

function getPoseInfoName(variant: Pick<PosePromptVariant, "titleZh" | "titleEn">) {
  return variant.titleEn.trim() || variant.titleZh.trim();
}

function buildCopyPosePrompt(titleZh: string) {
  return `绘制${titleZh.trim()}姿态的图`;
}

function isPlantTopLevelTheme(value?: string | null) {
  return /(plant|plants|植物)/i.test(value?.trim() ?? "");
}

function isPlantCategoryContext(topicName: string, ancestors: string[]) {
  return [topicName, ...ancestors].some((value) => isPlantTopLevelTheme(value));
}

function isBuildingTheme(value?: string | null) {
  return /(building|buildings|infrastructure|建筑|基础设施)/i.test(value?.trim() ?? "");
}

function isBuildingCategoryContext(topicName: string, ancestors: string[]) {
  return [topicName, ...ancestors].some((value) => isBuildingTheme(value));
}

function serializePosePromptSpecs(specs: PosePromptSpec[]) {
  return JSON.stringify(specs);
}

function extractPoseSeoTerms(specsJson?: string | null) {
  if (!specsJson?.trim()) {
    return [];
  }

  try {
    return parsePosePromptSpecs(specsJson)
      .map((spec) => spec.titleEn.trim() || spec.titleZh.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

type CategoryImgListResponse = {
  items: ImgListItem[];
};

type ExistingImgSourceDataState = {
  hasExistingData: boolean;
  sourceCount: number;
  uploadedSourceCount: number;
  promptOnlySourceCount: number;
  generatedImgCount: number;
};

function buildPoseInfoGeneratorPrompt(input: {
  theme: string;
  ancestors: string[];
}) {
  const topicName = input.theme.trim() || "在此填入三级主题";
  const categoryPath =
    input.ancestors.length > 0
      ? `${input.ancestors.join(" > ")} > ${topicName}`
      : topicName;
  const isBuildingContext = isBuildingCategoryContext(topicName, input.ancestors);
  const vehiclePresetInstruction = isRoadVehicleTheme(topicName, input.ancestors)
    ? `\n${getRoadVehiclePosePromptInstruction()}\n`
    : "";
  const plantPresetInstruction = isPlantCategoryContext(topicName, input.ancestors)
    ? `\n植物主题补充要求：植物不要默认固定为“幼苗期、成年期”两种。请先尽量为这个具体植物挑选视觉差异明显、常见且自然的姿态或生长状态，例如含苞、盛开、结果、叶片展开、枝条下垂、直立生长、攀援生长、漂浮叶片、莲座状展开等，但必须符合该植物本身。只有当这个具体植物确实很难找到自然且差异明显的常见状态时，才把“幼苗期”和“成熟期”作为备选条目。条数以该植物本身是否自然合理为准，不要为了凑数硬编。\n`
    : "";
  const buildingPresetInstruction = isBuildingContext
    ? `\n建筑主题补充要求：建筑类固定只输出 2 条，不要输出第 3 条或第 4 条。两条都必须是这个建筑主体本身最常见、最适合儿童识别的视角，不要依赖环境或场景制造差异。第 1 条必须是标准正面视角，titleZh 使用“正面视角”，titleEn 使用“Front View”。第 2 条必须是能看出侧面与立体结构的斜侧视角，titleZh 使用“斜侧视角”，titleEn 使用“Three Quarter View”。不要为建筑额外生成场景视角、背面、俯视、夜景、施工中等姿态；除非主题本身不是建筑类，才按通用规则处理。\n`
    : "";
  const countGuidance = isBuildingContext ? "建筑类固定 2 条" : POSE_VARIANT_COUNT_GUIDANCE;

  return `你是儿童打印资源站的插画策划助手。请先不要直接生成图片提示词，而是先为当前三级主题规划若干个“适合该主题本身”的不同主体姿态/状态信息（${countGuidance}，以自然合理为准）。

当前三级主题：${topicName}
分类路径：${categoryPath}
${vehiclePresetInstruction}
${plantPresetInstruction}
${buildingPresetInstruction}

任务要求：
1. 先判断这个主题属于哪类主体：动物/人物/昆虫/鸟类等生物主体，还是交通工具/机器/家具/乐器/建筑/日用品等非生物主体，并判断它本身是“动作姿态变化丰富”还是“动作姿态变化有限”的类型。
2. 你输出的内容必须真正适合这个主题本身，优先选择“这个主题最常见、最典型、最自然、用户一看就觉得合理”的主体姿态或状态，不要为了凑差异硬编罕见、不自然或不符合该主题本身的姿态。
3. 在“常见、合理”的前提下，让各条之间的差异尽可能大。优先拉开主体的大轮廓差异、主朝向差异、动作阶段差异、结构展开差异、功能状态差异或观看视角差异，不要只做轻微抬头、轻微转头、轻微挪动这类小差别。
4. 如果主题本身姿态变化天然丰富（例如很多动物、人物、鸟类、昆虫等），优先选择该主题最常见且视觉差异明显的主体姿态。对动物来说，优先挑“看起来差别大”的常见姿态组合；如果某个动物明显能跑、跳、飞或张翅，就优先使用这些与站立差异更大的姿态，不要用和站立看起来很接近的轻微行走来占掉一个名额。只有当该动物按习性并不擅长奔跑、很少奔跑，或奔跑并不是它最典型自然状态时，才优先考虑走路、低头、进食、回头、休息等更符合习性的差异姿态。例如腕龙、奶牛这类不应默认优先用“奔跑”来拉差异，而应优先选择更符合其习性的常见状态。不能机械套模板，必须看该主体本身的自然习性。
5. 如果主题本身姿态变化有限（例如车辆、家具、建筑、工具、器械、容器、乐器等），不要勉强发明大动作；应优先通过差异明显的视角、朝向、结构状态、开合状态、停放状态、运行状态、转向状态、使用状态等来拉开区别，例如正面、侧面、斜前 3/4、斜后/尾部、开启、关闭、展开、收起、工作中、停放中等，但仍要以该主题最常见、最自然的状态为准。
5a. 如果分类路径属于 Buildings / 建筑，必须固定输出 2 条：Front View / 正面视角、Three Quarter View / 斜侧视角。两条都只描述建筑主体本身的常见视角，不要用环境、背景、天气、时间或使用场景来制造差异。Front View 强调正面轮廓和入口；Three Quarter View 强调侧面结构和立体感。建筑类不要再补场景视角、背面、俯视、夜景或其他状态。
6. 如果某个主题既有姿态差异，也有视角或状态差异，优先先选最有代表性的常见主体状态，再用最能拉开轮廓和识别差异的视角/朝向/结构状态补足，不要让所有条目都只换一个很小的维度。
7. 这一阶段的重点是“规划主体本身最常见且最有区分度的差异”，不是提前解决最终绘图时的所有构图问题。请优先给出自然、可信、适合该主题的主体状态差异。
8. 对于天然细长或单向延伸很强的主体，可以在少数条目中使用自然的抬头、转身、轻微弯曲、轻微倾斜或高低变化来避免所有条目都变成单纯水平长条；但不要为了适配正方形而设计不自然的过度卷曲、盘绕、螺旋、夸张 S 弯、异常折叠或明显变形。
9. 原则上不要依赖场景制造差异；只有在单靠主体姿态/状态/视角确实难以清楚区分时，才允许加入一个极简、很小、服务于动作理解的辅助场景或环境元素，例如喝水时的一小口水盆、停靠时的极简站牌、使用时的一小块桌面，但场景必须次要、简单、占比很小。
10. 每条标题都要简洁，适合后续做 SEO / name 展示。
11. 每条都必须围绕“单一主体”展开，不要群像，不要复杂场景；即使带辅助场景，也只能是很小的陪衬，整体视觉重点仍然必须是主体本身。

输出格式要求：
1. 只输出 JSON。
2. 不要输出 Markdown 代码块，不要输出解释文字，不要输出前后说明。
3. 必须输出一个 JSON 数组，至少 1 条，条数以主题本身是否自然合理为准；如果是建筑类，必须恰好 2 条。
4. 数组中每个对象必须严格包含以下 2 个字符串字段：
   - titleZh
   - titleEn
5. 这 2 个字段在每一条对象里都必须完整出现，不能缺少任何一个字段。
6. 每个字段都必须是非空字符串，不能留空，不能省略，不能写 null，不能写占位符。

字段说明：
- titleZh：中文短标题，2~6 个字，简洁表意。
- titleEn：英文短标题，1~3 个英文单词，简洁表意。

请特别注意：
- 目标不是平均分配几种差异方式，而是从所有候选里选出“最常见、最合理、差异最大”的若干条。
- 如果动作差异不足，请主动切换到视角、朝向、结构状态、功能状态来拉开区别，而不是硬造不自然姿态。
- 优先大差异，不要所有条目都只是轻微角度变化；但也不要为了追求差异而使用罕见、夸张、不符合该物体本身的状态。
- 建筑类请直接输出：[{"titleZh":"正面视角","titleEn":"Front View"},{"titleZh":"斜侧视角","titleEn":"Three Quarter View"}]，除非当前主题明显不是建筑或基础设施。
- 例如公交车、汽车、火车、工程车等更适合优先考虑正面、侧面、斜前、斜后、停靠、转向、开门、工作中等常见视角或状态。
- 例如动物更适合优先考虑站立、奔跑、坐姿、趴卧、低姿、回头、张翅等常见姿态，但要优先选“视觉差异大”的组合；如果奔跑和该动物习性不符，就不要硬用奔跑，应改用更符合该动物自然习性的走路、低头、进食、休息等状态。
- 如果主体天然细长，不要求你把所有条目都强行设计成“适合正方形”的姿态；先保证姿态本身自然、可信、因主题而异，再给出简短构图方向即可。
- 如果某些动作只有配合很小的辅助场景才容易理解，可以加入极简场景提示，但场景必须非常简单，且仍然只是辅助说明，不要让场景主导差异。
- 在输出前请自行检查：每个对象是否都包含 titleZh、titleEn 这 2 个字段，而且每个字段都不为空。

下面是单条对象的字段模板，请严格按这个结构为每条都写完整：
{
  "titleZh": "示例",
  "titleEn": "Example"
}

请只返回 JSON 数组本身。`;
}

function parsePosePromptSpecs(rawText: string): PosePromptSpec[] {
  const normalized = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  if (!normalized) {
    throw new Error("请先粘贴 AI 返回的姿态信息 JSON。");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(normalized);
  } catch {
    throw new Error("粘贴内容不是合法 JSON，请让 AI 严格只返回 JSON 数组。");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("姿态信息必须是一个 JSON 数组。");
  }

  if (parsed.length === 0) {
    throw new Error("姿态信息至少需要 1 条。");
  }

  return parsed.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`第 ${index + 1} 条不是合法对象。`);
    }

    const pick = (key: keyof PosePromptSpec) => {
      const value = (item as Record<string, unknown>)[key];
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(`第 ${index + 1} 条缺少字段 ${key}，或该字段为空。`);
      }
      return value.trim();
    };
    return {
      titleZh: pick("titleZh"),
      titleEn: pick("titleEn"),
    };
  });
}

function buildPosePromptVariants(input: {
  theme: string;
  ancestors: string[];
  specs: PosePromptSpec[];
}) {
  const topicName = input.theme.trim() || "(fill in third-level topic name)";
  const categoryPath =
    input.ancestors.length > 0
      ? `${input.ancestors.join(" > ")} > ${topicName}`
      : topicName;

  return input.specs.map((variant, index) => ({
    ...variant,
    key: `pose-${index + 1}`,
    chinesePrompt: buildCopyPosePrompt(variant.titleZh),
    englishPrompt: `请生成一张用于儿童打印素材的简洁彩图插画，三级主题为【${topicName}】。分类路径参考：${categoryPath}。

请绘制【${variant.titleZh} / ${variant.titleEn}】这个常见姿态的主体图。

风格与画面要求：
1. 只保留一个主体，不要多主体，不要群像。这里的“一个主体”必须是一个完整、连续、正常可读的单体结构，不能出现双头、多脸、额外尾巴、额外肢体、分离身体部件、镜像重复部位、连体结构或任何会被看成第二只动物/第二个主体的形态错误。
2. 让主体明确呈现【${variant.titleZh}】这一姿态或视角；如果这是非生物对象，请优先把这一标题理解成对应的常见视角、朝向或状态。
3. 优先不要依赖背景或场景来制造差异；如果单靠主体姿态或视角确实难以区分，允许加入一个极简、很小、服务于理解的辅助场景或环境元素，但它必须次要、占比很小、风格与主体一致。
4. 整体风格必须首先读起来像“儿童卡通打印插画”，而不是写实动物插画、半写实绘本插画或自然观察图。必须与上方封面图一致：以儿童打印资源站主风格为准，优先清晰轮廓、低复杂度、纯色块、强识别、强打印可读性。即使需要保留少量物种识别特征，也必须优先让整体呈现明确的儿童卡通感。
4. 使用清晰、闭合、利落但不过分夸张的黑色外轮廓线，不要额外添加白色贴纸边、发光外框、阴影外发光或 cutout 效果，也不要做成特别粗重、特别硬的图标化描边。
5. 内部只填充干净、明快、儿童友好的纯色块，默认不要任何阴影效果。不要渐变、不要厚重写实明暗、不要地面投影、不要接触阴影、不要边缘压暗、不要纹理。只有在极少数确实影响结构识别时，才允许使用非常轻、非常少、非常平的两色块式明暗区分，但不能形成明显阴影、高光反射或真实体积塑造。不要任何形式的投影、光晕、镜面高光、环境光遮蔽或发光效果，也不要出现真实毛发层次、真实材质刻画、柔和体积渲染或绘本式笔触。
6. 画面必须是简洁彩图，不要做成纯黑白线稿，也不要只用黑白灰；如果主体天然偏黑白，也要用少量简洁辅助色让整体仍然是彩图观感。
7. 主体比例必须是“明确卡通化后的自然简化比例”，更接近儿童卡通认知卡片，而不是写实动物结构图。不要 Q 版，不要大头小身，不要头部夸张放大，不要四肢过短，不要婴儿化比例，但也不要把解剖结构保留得过于真实。若“更真实”和“更卡通”发生冲突，优先选择更卡通。
8. 若是动物或人物，头身关系、躯干长度、四肢长度、站姿和身体重心应保持可信，但应明显转化为儿童卡通造型语言：更圆润、更友好、更简洁。面部信息要少，优先儿童卡通可读性，不要表情包感、不要过度卖萌、不要夸张嘴型、不要强拟人化，也不要写实五官结构。
9. 若主体是动物，眼睛不要只画成一个生硬的纯黑圆点，也不要所有动物都套用同一种模板眼睛，更不要做成写实复杂眼睛。眼部处理应简洁、友好、儿童可读，并保持明确卡通感；可以弱化真实物种眼型细节，只保留少量能帮助识别物种气质的差异。可以保留极少量必要留白帮助识别，但不要浓重眼睫毛、不要多层眼线、不要真实高光、不要湿润反光感、不要复杂瞳孔结构。整体面部重点是卡通、干净、易识别，而不是自然写实。
10. 若主体是动物，身体结构必须保持唯一且完整：只能有一个头、一个口鼻部、一个颈部、一个躯干、一个尾巴和正常数量的四肢。不要生成重复头部、第二张脸、额外口鼻、额外尾巴、额外腿脚、分叉身体、尾巴与头部融合成第二个脸、前后肢错位叠成额外肢体，或任何超现实、畸形、多余器官错误。
11. 若主体是动物或人物，身体轮廓和器官关系必须连续、清楚、单一可读。尾部、臀部、背部、耳朵或其他边缘形体都不能长成像第二个头、第二张脸或第二个主体的错觉。视觉差异只能来自姿态、朝向和整体外形变化，绝不能来自额外器官、重复部位或异常变形。
12. 最终输出必须为严格 1:1 正方形画布，不要横图，不要竖图；若工具支持尺寸参数，请按 1024×1024 输出。背景必须纯白，不要地面色块、不要投影底座、不要环境底纹、不要任何场景承托。
13. 主体建议占画面约 55%–75%，保留足够留白，并在正方形画布内视觉居中；四周留白要尽量均衡，不允许一侧出现大面积空白。主体整体应主要落在画布中心区域，不要把主体过度横向拉长、纵向拉高或做成细长贯穿整张画面的形态。对于天然细长的主体，优先通过主体本身自然、合理、可信的姿态变化来提升纵向占比和主形集中度，例如轻微弯曲、轻微抬高、轻微倾斜、自然转折或温和的上下起伏。不要先画成长横条再靠空白去适配正方形，但也不要为了压缩画面而把主体画成不自然的过度卷曲、盘绕、螺旋、夸张S弯、异常折叠或明显变形。主体结构真实性优先于填满画面；如果在保持自然结构后仍有一定留白，可以接受适度留白。若主体是动物或人物，优先轻侧身或 3/4 侧自然角度；如用正面，不要完全对称、不要卡片式摆拍。只有当主体天然在某一方向特别长、且经过自然姿态调整后仍然造成另一方向极端空白时，才允许加入一个极简、很小的辅助场景或平衡元素来微调画面均衡。
14. 若使用道具或辅助场景元素，它们都必须很小、很少、很辅助，不能抢主体。若确有必要用场景帮助区分动作或平衡极端空白，场景也只能是极简的一小部分，必须贴近主体并集中在画面中间附近，不能变成场景图，也不能成为第二视觉中心。
15. 不要复杂场景、不要大背景、不要密集环境叙事；即使有辅助场景，也要与主体一起集中在画面中间，不要铺满整个图片。
16. 线条数量要少，结构要明确，只保留必要外轮廓和少量关键内部结构线，不要复杂纹理、重复内部轮廓层、连续细碎边缘、密集层叠小形、尖锐小突起或零碎装饰线。除非某些结构特征对主体识别确实不可缺少，否则整体细节线条都应尽量减少，不要为了“更丰富”而额外加线。内部细节要明显简化，尽量保留较大的色块和清楚的形体分区，适合后续用于 3–8 岁儿童的涂色、描红、剪贴等打印场景。优先大形体、大色块、大轮廓关系，不要让大量小线条、小尖角、小碎块抢走主体识别度。画面重点必须放在主体姿态、动作、朝向与外形差异上，同时保持封面图那种简洁、友好的视觉气质。主体不要贴边裁切，不要铺满全屏，画面要轻、干净、主体明确。

输出目标：
请围绕【${variant.titleZh}】这个姿态或视角生成一张与同主题其他姿态明显不同、且与封面图风格完全一致的儿童卡通彩图主体图。整体应低复杂度、易识别、轮廓清晰、纯色块明确、强儿童卡通感、非写实、非半写实，适合儿童打印资源使用。`,
  }));
}

function buildOutlinePromptText(input: {
  theme: string;
  categoryPath: string;
  variant: PosePromptVariant;
}) {
  const { theme, categoryPath, variant } = input;
  return {
    chinese: `请生成一张用于儿童打印素材的黑白线框原始图，三级主题为【${theme}】。分类路径参考：${categoryPath}。

请绘制【${variant.titleZh} / ${variant.titleEn}】这个姿态或视角的单主体线框图。

线框图要求：
1. 只保留一个主体，不要多主体，不要群像，不要复杂场景。
2. 这是直接生成的原始线框图，不是彩图转线稿；请直接输出可打印的黑白线稿版本。
3. 只使用清晰、闭合、顺滑、黑色的外轮廓线和少量必要结构线；不要任何颜色填充，不要灰度，不要渐变，不要阴影，不要高光，不要纹理，不要噪点，不要任何形式的光影效果。
4. 主体比例必须保持自然简化，不要 Q 版，不要吉祥物感，不要贴纸图标感，不要夸张变形。
5. 如果主体是动物，眼睛不要画成单独一个实心黑点，也不要所有动物都画成完全一样的眼睛，更不要画成写实复杂眼睛。应使用非常简洁的眼部轮廓，但尽量贴近该动物本身更自然的眼型特征，例如偏圆、偏椭圆、偏杏仁形或更细长的简化眼形；必要时可保留极少量留白帮助识别。不要睫毛堆叠、不要复杂瞳孔、不要高光反光、不要厚重眼线。整体面部线条仍要少，避免脸部细节过多。
6. 内部线条数量要严格控制，只保留识别主体所必需的少量关键结构线，继续减少细碎、重复、尖锐、密集的小线条。除非某些结构对主体识别确实必要，否则不要额外补充装饰性细节线。
7. 最终输出必须为严格 1:1 正方形画布，背景纯白，主体视觉居中，四周留白尽量均衡，不要裁切主体，不要地面色块，不要投影底座。
8. 对于天然细长的主体，允许轻微自然的姿态变化来收拢主形，但不要为了适配正方形而出现不自然的卷曲、盘绕、夸张 S 弯、异常折叠或明显变形。
9. 整体必须适合儿童涂色、描红和打印使用，轮廓清楚，结构简洁，主体识别度高。`,
    english: `Create one black-and-white outline source image for children's printable use. Third-level topic: [${theme}]. Category path: ${categoryPath}.

Draw the single-subject outline image for the pose or view [${variant.titleEn} / ${variant.titleZh}].

Outline rules:
1. Keep only one subject. No multiple subjects, no crowd composition, and no complex scene.
2. This is a directly generated source line-art image, not a color-to-line conversion. Output a print-friendly black-and-white line-art version directly.
3. Use only clear, closed, smooth black outer contours and a very small number of necessary structure lines. No color fill, no grayscale, no gradients, no shading, no highlights, no texture, no grain, and no lighting effects of any kind.
4. Keep naturally simplified proportions. Do not make it chibi, mascot-like, sticker-icon-like, or unnaturally distorted.
5. If the subject is an animal, do not draw the eye as a single solid black dot, do not give every animal the exact same eye shape, and do not make it realistic or complicated. Use a very simple eye contour, but let it still reflect the animal's more natural eye character, such as rounder, more oval, more almond-shaped, or narrower simplified eye shapes depending on the subject. A tiny preserved white area is acceptable when it helps readability. Avoid layered eyelashes, complex pupils, realistic highlights, and heavy eyeliner. Keep facial linework sparse overall so the face does not become over-detailed.
6. Keep interior line count strictly controlled. Retain only the minimum key structure lines needed for recognition, and reduce tiny, repeated, sharp, or dense linework. Unless a structural cue is truly necessary for recognition, do not add extra decorative detail lines.
7. The final output must be a strict 1:1 square canvas with a pure white background. Keep the subject visually centered with balanced margins, without cropping, ground patches, or shadow bases.
8. For naturally elongated subjects, mild natural pose adjustment is allowed to concentrate the shape, but do not introduce unnatural curling, coiling, exaggerated S-curves, abnormal folding, or obvious deformation just to fit the square.
9. The final result must be suitable for children's coloring, tracing, and printing, with clear contours, simple structure, and strong recognizability.`,
  };
}

function buildSceneBackgroundGuidance(input: {
  theme: string;
  categoryPath: string;
  variant: PosePromptVariant;
}) {
  const context = [
    input.theme,
    input.categoryPath,
    input.variant.titleZh,
    input.variant.titleEn,
  ]
    .join(" ")
    .toLowerCase();

  const baseGuidance = {
    zh: "背景元素请围绕该主题本身组织，优先使用与该主题直接相关的环境要素来铺满画面，而不是套用任何主体都能通用的蓝天白云、草地、石头、灌木模板背景。请先考虑该主题最典型的环境，再决定天空、地面、远景和辅助元素。",
    en: "Build the background around the theme itself, prioritizing environment elements that are directly tied to this specific subject instead of relying on a generic blue-sky, white-cloud, grass, rock, and bush template that could fit almost anything. Start from the most typical environment of the subject, then decide the sky, ground, distant layers, and supporting elements.",
  };

  const typeGuidanceRules: Array<{
    test: RegExp;
    zh: string;
    en: string;
  }> = [
    {
      test: /(diplodocus|brontosaurus|brachiosaurus|apatosaurus|long neck dinosaur|long-neck dinosaur|sauropod|梁龙|长颈恐龙|蜥脚类)/,
      zh: "背景请优先使用更贴合长颈草食恐龙的史前环境，而不是通用恐龙背景。应更多采用开阔裸土地面、低矮远古山丘、成片但简化的蕨类和史前灌木、零散岩层、远处层叠地貌与较开阔的天空，让画面更像适合长颈大型草食恐龙活动的史前平原或河谷环境。",
      en: "Prioritize a prehistoric setting that fits long-neck herbivorous dinosaurs rather than a generic dinosaur background. Use more open bare ground, low prehistoric hills, grouped but simplified fern-like plants and primitive bushes, scattered rock layers, distant layered landforms, and a relatively open sky so the scene feels like a prehistoric plain or river-valley habitat suited to large long-neck herbivores.",
    },
    {
      test: /(t-rex|tyrannosaurus|velociraptor|raptor|carnivore dinosaur|theropod|霸王龙|迅猛龙|食肉恐龙|兽脚类)/,
      zh: "背景请优先使用更有张力的史前陆地环境，例如裸露地面、岩层、断续灌木、起伏地貌、远处山体和更明显的地形方向感，让画面更像食肉恐龙活动的史前荒原，而不是平静的通用草地背景。",
      en: "Prioritize a more dramatic prehistoric land environment, such as exposed ground, rock layers, sparse bushes, uneven terrain, distant mountains, and stronger directional land shapes so the image feels like a prehistoric hunting plain for carnivorous dinosaurs rather than a calm generic grass field.",
    },
    {
      test: /(triceratops|stegosaurus|ankylosaurus|horned dinosaur|armored dinosaur|三角龙|剑龙|甲龙|有角恐龙|装甲恐龙)/,
      zh: "背景请优先使用更贴合低重心陆地恐龙的史前环境，例如宽阔地面、低矮植物、岩石群、地表起伏和较低的远景线，让主体显得更稳重，而不是使用高耸植物或轻飘的通用背景。",
      en: "Prioritize a prehistoric setting that fits low-bodied land dinosaurs, such as broad ground planes, low vegetation, clustered rocks, rolling surface shapes, and a lower horizon line so the subject feels grounded rather than placed in a light generic backdrop.",
    },
    {
      test: /(dinosaur|dinosaurs|jurassic|cretaceous|triassic|sauropod|t-rex|triceratops|diplodocus|梁龙|恐龙)/,
      zh: "背景请优先使用简化的史前自然环境，而不是普通现代儿童风景。应更多采用开阔裸土地面、岩层、低矮远古山丘、蕨类、史前灌木、零散岩石、浅色远景天空等元素，让画面一眼更像恐龙题材的儿童史前场景，而不是任何动物都能套用的草地模板。",
      en: "Prioritize a simplified prehistoric natural environment rather than a generic modern children's landscape. Use more open bare ground, layered rocks, low prehistoric hills, fern-like plants, primitive bushes, scattered stones, and a pale distant sky so the image reads clearly as a dinosaur-themed children's prehistoric scene instead of a generic grassland template that could fit any animal.",
    },
    {
      test: /(school bus|校车)/,
      zh: "背景请优先使用校车专属的儿童出行环境，例如校门、简化道路、路边树木、人行道、校牌或远处教学楼轮廓，让画面一眼更像校车场景，而不是普通公交背景。",
      en: "Prioritize a school-bus-specific children's travel setting, such as a school gate, simplified road, roadside trees, sidewalk, school sign, or distant school-building silhouettes so the image clearly reads as a school-bus scene rather than a generic bus background.",
    },
    {
      test: /(bus|公交|巴士)/,
      zh: "背景请优先使用城市或站点道路环境，例如车道、站牌、路边绿化、简化建筑、斑马线或转弯路段，让画面更像公交运行环境，而不是任何车辆都能套用的普通道路背景。",
      en: "Prioritize an urban or stop-based road environment, such as traffic lanes, bus-stop signs, roadside greenery, simplified buildings, zebra crossings, or turning road shapes so the scene feels like a bus route environment rather than a generic vehicle roadway.",
    },
    {
      test: /(ambulance|救护车|fire truck|消防车|police car|警车)/,
      zh: "背景请优先使用与其职能直接相关的简化城市环境，例如道路、标识、路口、建筑轮廓与少量功能性线索，让画面更像执行任务环境，而不是普通车辆背景。",
      en: "Prioritize a simplified city environment directly related to its function, such as roads, signs, intersections, building silhouettes, and a few functional clues so the image feels tied to its duty rather than to a generic vehicle scene.",
    },
    {
      test: /(bus|car|truck|vehicle|taxi|van|ambulance|fire truck|police car|公交|汽车|卡车|巴士|校车|救护车|消防车|警车)/,
      zh: "背景请使用简化的道路场景，例如天空、道路、路边绿化、路牌、站牌或远处建筑轮廓，让车辆处在完整的出行环境中。",
      en: "Use a simplified road scene, such as sky, roadway, roadside greenery, road signs, bus stops, or distant building silhouettes so the vehicle sits in a complete travel environment.",
    },
    {
      test: /(subway|地铁)/,
      zh: "背景请优先使用简化的城市轨道环境，例如站台、轨道、隧道口、导向标识和远处结构轮廓，让画面更像地铁或城市轨道场景。",
      en: "Prioritize a simplified urban rail environment, such as platform shapes, tracks, tunnel openings, directional signs, and distant structural silhouettes so the image feels like a subway or city-rail setting.",
    },
    {
      test: /(train|subway|tram|locomotive|railway|火车|地铁|电车|轨道)/,
      zh: "背景请使用简化的铁路场景，例如天空、铁轨、站台、信号牌、远处山丘或建筑，让主体处在完整的轨道交通环境中。",
      en: "Use a simplified railway scene, such as sky, tracks, platform shapes, signal signs, and distant hills or buildings so the subject sits in a complete rail environment.",
    },
    {
      test: /(rocket|spaceship|火箭|飞船|太空)/,
      zh: "背景请优先使用太空或发射环境，例如星空、行星、发射台、烟雾形状或地平线结构，让画面更像航天主题，而不是普通蓝天飞行背景。",
      en: "Prioritize a space or launch setting, such as star fields, planets, launch-pad forms, smoke shapes, or horizon structures so the image feels like a space theme rather than a generic blue-sky flight background.",
    },
    {
      test: /(airplane|plane|jet|helicopter|rocket|spaceship|aircraft|飞机|直升机|火箭|飞船)/,
      zh: "背景请使用简化的天空或飞行场景，例如大块天空、云朵、远景地平线、跑道或太空元素，让飞行主体周围有完整的空间信息。",
      en: "Use a simplified sky or flight scene, such as broad sky areas, clouds, a distant horizon, runway elements, or space details so the flying subject has a complete surrounding environment.",
    },
    {
      test: /(submarine|潜艇)/,
      zh: "背景请优先使用更贴合潜艇的深海或海下环境，例如层次分明的水体、海底地形、远处海底岩石和较少但明确的海下元素，而不是普通船只水面背景。",
      en: "Prioritize a deeper underwater setting suited to a submarine, such as layered water depth, seabed forms, distant underwater rocks, and a smaller number of clear underwater elements rather than a surface-boat waterscape.",
    },
    {
      test: /(boat|ship|submarine|sailboat|ocean|sea|海盗船|船|轮船|潜艇|帆船)/,
      zh: "背景请使用简化的水域场景，例如天空、水面、波浪、岸边、码头或远处小岛，让主体处在完整的水上环境中。",
      en: "Use a simplified water scene, such as sky, water surface, waves, shoreline, docks, or distant islands so the subject sits in a complete waterscape.",
    },
    {
      test: /(penguin|polar bear|seal|walrus|企鹅|北极熊|海豹|海象|极地)/,
      zh: "背景请优先使用极地环境，例如冰面、雪地、远处冰山、寒冷天空和简化冰块层次，让画面更像明确的极地儿童场景，而不是普通草地自然背景。",
      en: "Prioritize a polar environment, such as ice sheets, snowy ground, distant icebergs, cold sky tones, and simplified ice layers so the scene clearly reads as a polar children's setting rather than a generic natural landscape.",
    },
    {
      test: /(camel|scorpion|lizard|desert|骆驼|蝎子|蜥蜴|沙漠)/,
      zh: "背景请优先使用沙漠或干旱环境，例如沙地、沙丘、裸岩、少量耐旱植物和远处热感地平线，让画面更像该主题所属的干旱场景。",
      en: "Prioritize a desert or arid environment, such as sandy ground, dunes, exposed rocks, sparse drought-tolerant plants, and a hot distant horizon so the image fits an arid habitat.",
    },
    {
      test: /(fish|shark|whale|dolphin|octopus|jellyfish|crab|turtle|ocean animal|marine|鱼|鲨鱼|鲸鱼|海豚|章鱼|水母|螃蟹|海龟|海洋)/,
      zh: "背景请使用简化的水下环境，例如蓝色水体、海草、珊瑚、气泡、海底地面和远处水层，让整张图成为完整的海底场景。",
      en: "Use a simplified underwater environment, such as blue water, seaweed, coral, bubbles, seabed ground, and distant water layers so the image becomes a full underwater scene.",
    },
    {
      test: /(cow|sheep|goat|pig|barn|奶牛|羊|山羊|猪|谷仓|牧场)/,
      zh: "背景请优先使用更典型的农场牧场环境，例如围栏、谷仓、草地、泥土地、远处农舍和简化树木，让画面一眼像儿童农场场景。",
      en: "Prioritize a more typical farm or pasture setting, such as fences, barn shapes, grassy areas, dirt ground, distant farmhouse forms, and simplified trees so the image clearly reads as a children's farm scene.",
    },
    {
      test: /(horse|pony|马|小马)/,
      zh: "背景请优先使用更贴合马类活动的开阔场地，例如牧场、围栏、跑道、草地和远景树线，让主体更像在奔跑或停驻的马场环境中。",
      en: "Prioritize a setting that fits horses, such as pasture fields, fences, riding tracks, grassland, and distant tree lines so the subject feels placed in a riding or grazing environment.",
    },
    {
      test: /(cow|horse|pig|sheep|goat|chicken|duck|farm|barn|奶牛|马|猪|羊|山羊|鸡|鸭|农场)/,
      zh: "背景请使用简化的农场环境，例如天空、草地、围栏、谷仓、泥土地和远处树木，让主体融入完整农场场景。",
      en: "Use a simplified farm setting, such as sky, grass, fences, barn shapes, dirt ground, and distant trees so the subject fits into a complete farm scene.",
    },
    {
      test: /(lion|zebra|giraffe|elephant|savanna|草原|狮子|斑马|长颈鹿|大象)/,
      zh: "背景请优先使用草原环境，例如开阔地面、低草丛、远处稀疏树木、平缓地平线和暖色土地，让主体更像非洲草原动物场景。",
      en: "Prioritize a savanna environment, such as open ground, low grasses, sparse distant trees, a gentle horizon, and warm earth tones so the subject feels like it belongs in a savanna animal scene.",
    },
    {
      test: /(tiger|monkey|parrot|jungle|rainforest|老虎|猴子|鹦鹉|丛林|雨林)/,
      zh: "背景请优先使用丛林或热带环境，例如层叠叶片、树干、藤蔓、热带地面和更密一点的远景层次，但仍要控制复杂度，不要变成密集森林海报。",
      en: "Prioritize a jungle or tropical environment, such as layered leaves, tree trunks, vines, tropical ground shapes, and slightly denser background layers while still keeping the complexity controlled and avoiding a dense forest poster look.",
    },
    {
      test: /(lion|tiger|elephant|giraffe|zebra|monkey|jungle|savanna|wild animal|狮子|老虎|大象|长颈鹿|斑马|猴子|丛林|草原|野生动物)/,
      zh: "背景请使用简化的野外环境，例如天空、草原或丛林地面、树木、灌木、岩石和远景层次，让主体位于完整自然栖息地中。",
      en: "Use a simplified wild habitat, such as sky, savanna or jungle ground, trees, bushes, rocks, and distant landscape layers so the subject sits in a complete natural habitat.",
    },
    {
      test: /(owl|猫头鹰)/,
      zh: "背景请优先使用树枝、树干、夜色或黄昏天空、月亮轮廓等更贴合猫头鹰活动的环境，而不是普通白天花草背景。",
      en: "Prioritize branches, tree trunks, dusk or night sky tones, and moon-like silhouettes that suit owls, rather than a generic daytime flower-and-grass background.",
    },
    {
      test: /(bee|butterfly|ladybug|蜜蜂|蝴蝶|瓢虫)/,
      zh: "背景请优先使用更贴近小型昆虫的花园或花丛视角，例如大朵花、叶片、草地和近景植物层次，让画面更像昆虫自己的活动环境。",
      en: "Prioritize a garden or flower-patch viewpoint suitable for small insects, such as larger flowers, leaves, grass, and near-plant layers so the image feels like the insect's own activity space.",
    },
    {
      test: /(bird|eagle|owl|parrot|penguin|flamingo|bee|butterfly|ladybug|insect|鸟|猫头鹰|鹦鹉|企鹅|火烈鸟|蜜蜂|蝴蝶|瓢虫|昆虫)/,
      zh: "背景请使用简化的自然活动环境，例如天空、树枝、叶片、花朵、草地或远景山丘，让画面充满与该主体相关的自然元素。",
      en: "Use a simplified natural activity setting, such as sky, branches, leaves, flowers, grass, or distant hills so the frame is filled with nature elements related to the subject.",
    },
    {
      test: /(tractor|拖拉机)/,
      zh: "背景请优先使用农田或乡村作业环境，例如田地、土路、简化农作物、远处农舍或围栏，让主体更像农业作业场景，而不是普通工程背景。",
      en: "Prioritize a farmland or rural work setting, such as fields, dirt paths, simplified crops, distant farm buildings, or fences so the subject feels tied to agricultural work rather than a generic construction backdrop.",
    },
    {
      test: /(excavator|bulldozer|crane|tractor|construction|dump truck|挖掘机|推土机|起重机|拖拉机|工程车|施工)/,
      zh: "背景请使用简化的施工或作业环境，例如天空、地面、土堆、路障、施工标记和远处设备轮廓，让主体处在明确的工作场景中。",
      en: "Use a simplified construction or worksite setting, such as sky, ground, soil piles, barriers, work markers, and distant equipment silhouettes so the subject sits in a clear work environment.",
    },
    {
      test: /(piano|钢琴)/,
      zh: "背景请优先使用更贴合钢琴的室内或舞台环境，例如地面、背景墙、窗户、乐谱架、舞台边界或简化聚光区域，而不是套用所有乐器都一样的背景。",
      en: "Prioritize an indoor or stage environment that fits a piano, such as floor shapes, back wall, windows, music stands, stage edges, or simplified spotlight areas rather than using the same background for every instrument.",
    },
    {
      test: /(guitar|violin|drum|吉他|小提琴|鼓)/,
      zh: "背景请优先使用更贴合演奏场景的环境，例如舞台、室内角落、墙面、地面和少量音乐相关元素，让乐器处在更明确的使用空间中。",
      en: "Prioritize a setting that fits playing or performance, such as a stage area, indoor corner, wall, floor, and a few music-related elements so the instrument sits in a clearer use space.",
    },
    {
      test: /(piano|guitar|drum|violin|instrument|乐器|钢琴|吉他|鼓|小提琴)/,
      zh: "背景请使用简化的音乐环境，例如室内地面、背景墙、窗户、舞台区或少量音符装饰，让乐器处在完整但不复杂的使用场景中。",
      en: "Use a simplified music setting, such as an interior floor, back wall, window shapes, stage area, or a few music-note accents so the instrument sits in a complete but simple use environment.",
    },
    {
      test: /(chair|table|bed|lamp|sofa|furniture|椅子|桌子|床|台灯|沙发|家具)/,
      zh: "背景请使用简化的室内环境，例如地面、墙面、窗户、地毯或角落摆设，让主体处在完整室内空间中，而不是漂浮在空白背景上。",
      en: "Use a simplified indoor setting, such as floor, wall, window shapes, rug areas, or corner decor so the subject sits in a complete interior space instead of floating on a blank background.",
    },
  ];

  const typeGuidance =
    typeGuidanceRules.find((rule) => rule.test.test(context)) ?? baseGuidance;

  let actionZh = "";
  let actionEn = "";
  if (/(drink|drinking|water|喝水|饮水)/.test(context)) {
    actionZh = " 当前姿态涉及饮水时，背景里应明确出现简化的水边、浅水区或小水潭。";
    actionEn = " Because this pose involves drinking, include a simplified water edge, shallow water area, or small pond in the background.";
  } else if (/(sleep|rest|resting|坐姿休息|休息|睡觉)/.test(context)) {
    actionZh = " 当前姿态偏休息状态时，背景可加入更稳定的地面、草丛、石块或树荫区域来承托休息氛围。";
    actionEn = " Because this pose is restful, the background may use stable ground, bushes, rocks, or a shaded area to support the resting mood.";
  } else if (/(turn|turning|looking back|回首|回头|转向)/.test(context)) {
    actionZh = " 当前姿态带有转向或回望感时，背景可通过道路弯线、地形转折或环境朝向增强方向变化。";
    actionEn = " Because this pose suggests turning or looking back, the background may use curved roads, terrain turns, or directional environment shapes to reinforce the change in direction.";
  }

  return {
    zh: `${typeGuidance.zh}${actionZh} 请减少任何与该主题关系不强、只是为了装饰角落而存在的通用元素。`,
    en: `${typeGuidance.en}${actionEn} Reduce any generic filler elements that are only decorating the corners and are not strongly tied to the subject itself.`,
  };
}

function buildSceneColorPromptText(input: {
  theme: string;
  categoryPath: string;
  variant: PosePromptVariant;
}) {
  const { theme, categoryPath, variant } = input;
  const sceneGuidance = buildSceneBackgroundGuidance(input);
  return {
    chinese: `请生成一张用于儿童打印素材的“带完整背景的彩图原始图”，三级主题为【${theme}】。分类路径参考：${categoryPath}。

请绘制【${variant.titleZh} / ${variant.titleEn}】这个姿态或视角的完整场景彩图。

背景元素建议：
${sceneGuidance.zh}

带背景彩图原始图要求：
1. 这是“完整场景彩图原始图”，不是纯白背景主体图，也不是主体旁边只加一点装饰背景的小场景图。
2. 最终输出必须为严格 1:1 正方形画布，整张画面都要被主体与背景共同填充，背景需要自然铺满整个画布，到达四周边缘，不要出现大面积纯白空白，不要只在底部放一小块地面。
3. 背景必须真正参与构图，让整张画面各区域都尽量有可识别的颜色区域、轮廓区域或场景区域，而不是大片空白。
4. 主体仍然必须是第一视觉中心，清晰、易识别、比例自然简化，不要 Q 版，不要吉祥物感，不要贴纸图标感，不要夸张变形。
5. 背景应与主题和姿态合理匹配，可以使用天空、地面、草地、山坡、树木、灌木、云朵、岩石、水边、道路等简化环境元素，但必须儿童友好、低复杂度、与主体同风格。
6. 背景不是写实风景画，不要复杂透视、不要密集环境叙事、不要真实照片感、不要过多小物件。优先使用大色块、大轮廓、清楚分区，让整张图干净、稳定、适合打印。
7. 使用清晰、闭合、利落但不过分夸张的黑色外轮廓线；主体与背景内部都以干净明快的纯色块为主，默认不要任何阴影效果。不要渐变、不要厚重阴影、不要地面投影、不要接触阴影、不要边缘压暗、不要高光反射、不要纹理、不要噪点、不要复杂光影，不要任何形式的投影、光晕、镜面高光或发光效果。只有在极少数确实影响主体或前后层级识别时，才允许使用非常轻、非常少、非常平的两色块式明暗区分，而且整体仍必须读起来像纯色块儿童场景插画，而不是光影渲染图。
8. 如果主体是动物，眼睛不要只画成僵硬的黑点，也不要所有动物都套用同一种眼睛模板，更不要画成写实复杂眼睛。应使用简洁、友好、儿童可读的眼部处理，但尽量贴近该动物本身更自然的眼型特征，例如偏圆、偏椭圆、偏杏仁形或略细长的简化眼睛；必要时可保留极少量留白帮助识别。不要多层睫毛、不要复杂瞳孔、不要真实高光、不要湿润反光感。面部线条总量要少，不要让脸部细节比主体轮廓更抢眼。
9. 背景信息要比普通彩图明显更多，但不能喧宾夺主。主体建议占画面约 35%–55%，背景承担其余画面信息，共同形成完整场景。整体线条仍应控制在较低水平，除非某些轮廓或结构对主体或场景识别确有必要，否则不要在主体或背景中堆积过多细节线。
10. 对于天然细长的主体，也不要再通过保留大面积空白来适配画布，而应结合完整背景把画面撑满；同时不要为了铺满画面把主体画得不自然。
11. 严禁出现网格线、拼图切缝、拼图块轮廓、分块辅助线、裁切线、版式边框线或任何后期加工指示线。最终结果必须是一张完整、连续、未被切分的儿童场景彩图：主体突出、背景完整、色块明确、边界清楚、低复杂度、打印友好。`,
    english: `Create one children's printable "colored source image with a full background" for the third-level topic [${theme}]. Category path: ${categoryPath}.

Draw the full-scene colored source image for the pose or view [${variant.titleEn} / ${variant.titleZh}].

Background element brief:
${sceneGuidance.en}

Full-background source image rules:
1. This is a full-scene colored source image, not a pure-white-background subject image and not a subject with only tiny decorative background accents.
2. The final output must be a strict 1:1 square canvas. The subject and background together must fill the whole frame naturally. The background should extend across the full canvas and reach the edges. Do not leave large white empty areas, and do not solve it with only a small ground patch near the subject.
3. The background must genuinely contribute to the composition so that different areas of the image contain recognizable color regions, shape regions, or scene content instead of large empty blanks.
4. The subject must still remain the primary focal point, clear, recognizable, and naturally simplified in proportion. Do not make it chibi, mascot-like, sticker-icon-like, or unnaturally distorted.
5. The background should match the theme and pose logically. It may include simplified elements such as sky, ground, grass, hills, trees, bushes, clouds, rocks, water edges, or roads, but it must stay child-friendly, low-complexity, and stylistically consistent with the subject.
6. This is not a realistic landscape painting. Avoid complex perspective, dense environmental storytelling, photo-like realism, and too many small props. Prioritize large color areas, large readable contours, and clear spatial separation so the whole image stays clean, stable, and printable.
7. Use clear, closed, crisp black outlines that are readable but not overly rigid. Both subject and background should rely mainly on clean, bright solid color shapes, and shadows should be avoided by default. No gradients, no heavy shading, no ground shadows, no contact shadows, no edge darkening, no specular highlights, no textures, no grain, no complicated lighting, and no glow, halo, or ambient occlusion effects of any kind. Only in rare cases where subject recognition or front/back separation would otherwise suffer may you use an extremely light, minimal, flat two-tone value separation, and the result must still read as flat children's scene illustration rather than rendered lighting.
8. If the subject is an animal, do not reduce the eyes to stiff black dots, do not apply the exact same eye template to every animal, and do not render realistic or highly complex eyes. Use simple, friendly, child-readable eye treatment, but let the simplified eye shape still reflect the animal's more natural eye character, such as rounder, more oval, more almond-shaped, or slightly narrower eyes depending on the subject. A tiny preserved white area is acceptable when it helps readability. Avoid layered eyelashes, complex pupils, realistic highlights, and glossy wet-eye rendering. Keep the total amount of facial linework low so the face does not overpower the silhouette.
9. The background should contain significantly more visual information than a normal colored subject image, but it must not overpower the subject. The subject should generally occupy about 35% to 55% of the frame, while the background carries the rest of the visual content to form a complete scene. Overall line density should still stay low; unless a contour or structure is truly needed for subject or scene recognition, do not pile up extra detail lines in either the subject or the background.
10. For naturally elongated subjects, do not adapt the square canvas by leaving large blank areas. Instead, use the full background composition to support a filled frame, while still keeping the subject structurally natural.
11. Avoid generic all-purpose children's scenery that could be reused for almost any animal or object. The background should feel specifically tied to this topic first, and decorative filler should be secondary.
12. Do not include any grid lines, puzzle cut seams, puzzle-piece outlines, segmentation guides, crop guides, panel dividers, or any other production/helper lines. The final result must be one complete, continuous children's scene illustration with a clear main subject, full background, readable color blocks, distinct boundaries, low complexity, and print-friendly.`,
  };
}

function buildImgSourcePromptPlans(input: {
  theme: string;
  ancestors: string[];
  variants: PosePromptVariant[];
}) {
  const topicName = input.theme.trim() || "(fill in third-level topic name)";
  const categoryPath =
    input.ancestors.length > 0
      ? `${input.ancestors.join(" > ")} > ${topicName}`
      : topicName;

  return input.variants.flatMap<ImgSourcePromptPlan>((variant, index) => {
    const poseInfoName = getPoseInfoName(variant);
    const poseRecordName = `${topicName} - ${poseInfoName}`;
    const outlinePrompt = buildOutlinePromptText({
      theme: topicName,
      categoryPath,
      variant,
    });
    const sceneColorPrompt = buildSceneColorPromptText({
      theme: topicName,
      categoryPath,
      variant,
    });
    const baseSort = index * 30;

    return [
      {
        source_kind: "color",
        prompt_key: `${variant.key}:color`,
        prompt_group: poseInfoName,
        title: `${poseRecordName} - ${SOURCE_PROMPT_NAME_META.color.titleSuffix}`,
        description: null,
        prompt_text_zh: buildCopyPosePrompt(variant.titleZh),
        prompt_text_en: variant.englishPrompt,
        sort_order: baseSort,
        is_active: true,
      },
      {
        source_kind: "outline",
        prompt_key: `${variant.key}:outline`,
        prompt_group: poseInfoName,
        title: `${poseRecordName} - ${SOURCE_PROMPT_NAME_META.outline.titleSuffix}`,
        description: null,
        prompt_text_zh: outlinePrompt.chinese,
        prompt_text_en: outlinePrompt.english,
        sort_order: baseSort + 1,
        is_active: true,
      },
      {
        source_kind: "scene_color",
        prompt_key: `${variant.key}:scene_color`,
        prompt_group: poseInfoName,
        title: `${poseRecordName} - ${SOURCE_PROMPT_NAME_META.scene_color.titleSuffix}`,
        description: null,
        prompt_text_zh: sceneColorPrompt.chinese,
        prompt_text_en: sceneColorPrompt.english,
        sort_order: baseSort + 2,
        is_active: true,
      },
    ];
  });
}

function getCategoryDepth(
  item: CategoryRecord,
  categoryMap: Map<number, CategoryRecord>,
) {
  let depth = 1;
  let cursorId = item.parent_id;

  while (cursorId !== null) {
    const parent = categoryMap.get(cursorId);
    if (!parent) {
      break;
    }
    depth += 1;
    cursorId = parent.parent_id;
  }

  return depth;
}

function collectDescendantIds(
  categoryId: number,
  childrenMap: Map<number, number[]>,
) {
  const ids = new Set<number>();
  const stack = [...(childrenMap.get(categoryId) ?? [])];

  while (stack.length > 0) {
    const currentId = stack.pop();
    if (currentId === undefined || ids.has(currentId)) {
      continue;
    }
    ids.add(currentId);
    stack.push(...(childrenMap.get(currentId) ?? []));
  }

  return ids;
}

function collectAncestorRecords(
  parentId: number | null | undefined,
  categoryMap: Map<number, CategoryRecord>,
) {
  const records: CategoryRecord[] = [];
  let id = parentId ?? null;

  while (id !== null) {
    const row = categoryMap.get(id);
    if (!row) {
      break;
    }
    records.unshift(row);
    id = row.parent_id;
  }

  return records;
}

function getUploadFileName(id: string) {
  return getCategoryImageFileName(id);
}

function buildCategoryImagePreviewUrl(
  id: string,
  options?: { proxy?: boolean; normalized?: boolean },
) {
  const searchParams = new URLSearchParams();
  searchParams.set("id", id);

  if (options?.proxy) {
    searchParams.set("proxy", "1");
  }

  if (options?.normalized) {
    searchParams.set("normalized", "1");
  }

  return `/api/admin/categories/images/preview?${searchParams.toString()}`;
}

function getBaseFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/i, "").trim() || "puzzle-worksheet";
}

function titleFromFileName(fileName: string) {
  return getBaseFileName(fileName)
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function getFileRelativePath(file: File) {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
}

function getPuzzlePairKey(file: File) {
  return getBaseFileName(file.name)
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[_-]+answers?$/i, "")
    .replace(/[_-]+solution$/i, "")
    .replace(/[_-]+key$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function isImageFile(file: File) {
  return file.type.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(file.name);
}

const IMG_DIFFICULTY_OPTIONS = [
  { label: "简单", value: 1 },
  { label: "中等", value: 2 },
  { label: "困难", value: 3 },
];

const IMG_DIFFICULTY_LABEL_BY_VALUE: Record<number, { label: string; color: string }> = {
  1: { label: "简单", color: "green" },
  2: { label: "中等", color: "gold" },
  3: { label: "困难", color: "red" },
};

function buildPuzzleWorksheetPreviewUrl(record: ImgListItem) {
  if (record.file_sync_status === "draft") {
    return null;
  }

  const params = new URLSearchParams();
  const imagePath = record.image_url_card?.trim() || record.image_url?.trim();
  const localFilePath =
    record.local_file_path_card?.trim() || record.local_file_path?.trim();

  if (imagePath) {
    params.set("path", imagePath);
  }

  if (localFilePath) {
    params.set("local_file_path", localFilePath);
  }

  return params.size ? `/api/admin/imgs/preview?${params.toString()}` : null;
}

function buildPuzzleWorksheetDownloadUrl(record: ImgListItem) {
  if (record.file_sync_status === "draft") {
    return null;
  }

  const params = new URLSearchParams();
  const imagePath = record.image_url?.trim();
  const localFilePath = record.local_file_path?.trim();

  if (imagePath) {
    params.set("path", imagePath);
  }

  if (localFilePath) {
    params.set("local_file_path", localFilePath);
  }

  if (!params.size) {
    return null;
  }

  const fileName = `${getBaseFileName(record.slug || record.title || `puzzle-${record.id}`)}.webp`;
  params.set("download", "1");
  params.set("filename", fileName);

  return `/api/admin/imgs/preview?${params.toString()}`;
}

function buildPuzzleWorksheetAnswerPreviewUrl(record: ImgListItem) {
  const params = new URLSearchParams();

  if (record.answer_image_url?.trim()) {
    params.set("path", record.answer_image_url.trim());
  }

  if (record.answer_local_file_path?.trim()) {
    params.set("local_file_path", record.answer_local_file_path.trim());
  }

  return params.size ? `/api/admin/imgs/preview?${params.toString()}` : null;
}

function buildPuzzleWorksheetAnswerDownloadUrl(record: ImgListItem) {
  const previewUrl = buildPuzzleWorksheetAnswerPreviewUrl(record);

  if (!previewUrl) {
    return null;
  }

  const [path, query = ""] = previewUrl.split("?");
  const params = new URLSearchParams(query);
  const fileName = `${getBaseFileName(record.slug || record.title || `puzzle-${record.id}`)}-answer.webp`;
  params.set("download", "1");
  params.set("filename", fileName);

  return `${path}?${params.toString()}`;
}

type PuzzleWorksheetUploadPanelProps = {
  categoryId?: number;
  activeItems: ActiveListItem[];
  useDifficulty?: boolean;
  title?: string;
  description?: string;
};

function PuzzleWorksheetUploadPanel({
  categoryId,
  activeItems,
  useDifficulty = true,
  title = "Puzzle Worksheet 图片",
  description = "Puzzles 三级分类不使用原始图、提示词和一键生成功能图。这里会把上传图片直接保存为 Puzzle Worksheet 功能图；可为每张题图单独上传答案图。",
}: PuzzleWorksheetUploadPanelProps) {
  const [messageApi, contextHolder] = message.useMessage();
  const [items, setItems] = useState<ImgListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [answerPreview, setAnswerPreview] = useState<{
    title: string;
    url: string;
  } | null>(null);
  const [selectedImgIds, setSelectedImgIds] = useState<number[]>([]);
  const [processingDirectory, setProcessingDirectory] = useState(false);
  const [activeDifficulty, setActiveDifficulty] = useState(1);
  const nextSortOrderRef = useRef(0);
  const directoryInputRef = useRef<HTMLInputElement | null>(null);
  const puzzleActive = useMemo(
    () => activeItems.find((item) => item.slug === "puzzle-worksheet") ?? null,
    [activeItems],
  );

  const fetchItems = useCallback(async () => {
    if (!categoryId || !puzzleActive) {
      setItems([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `/api/admin/imgs?category_id=${categoryId}&active_id=${puzzleActive.id}`,
        { cache: "no-store" },
      );
      const data = (await response.json()) as
        | CategoryImgListResponse
        | { error?: string };
      if (!response.ok || !("items" in data)) {
        throw new Error("error" in data ? data.error : "获取 Puzzle Worksheet 图片失败。");
      }
      setItems(data.items);
      setSelectedImgIds((current) =>
        current.filter((id) => data.items.some((item) => item.id === id)),
      );
      nextSortOrderRef.current =
        data.items.reduce((max, item) => Math.max(max, item.sort_order), -1) + 1;
    } catch (error) {
      messageApi.error(
        error instanceof Error ? error.message : "获取 Puzzle Worksheet 图片失败。",
      );
    } finally {
      setLoading(false);
    }
  }, [categoryId, messageApi, puzzleActive]);

  useEffect(() => {
    void fetchItems();
  }, [fetchItems]);

  const uploadPuzzleImageFile = useCallback(
    async (file: File) => {
      if (!categoryId) {
        throw new Error("请先保存当前三级分类，再上传图片。");
      }
      if (!puzzleActive) {
        throw new Error("缺少功能 Puzzle Worksheet，请先在功能管理中新增。");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("category_id", String(categoryId));
      formData.append("active_id", String(puzzleActive.id));

      const uploadResponse = await fetch("/api/admin/imgs/upload", {
        method: "POST",
        body: formData,
      });
      const uploadData = (await uploadResponse.json()) as
        | {
            image_url: string;
            image_url_card: string;
            local_file_path: string | null;
            local_file_path_card: string | null;
          }
        | { error?: string };
      if (!uploadResponse.ok || !("image_url" in uploadData)) {
        throw new Error("error" in uploadData ? uploadData.error : "上传图片失败。");
      }

      return uploadData;
    },
    [categoryId, puzzleActive],
  );

  const createPuzzleWorksheetItem = useCallback(
    async (file: File, difficulty = activeDifficulty) => {
      if (!categoryId || !puzzleActive) {
        throw new Error("请先保存当前三级分类，并确认 Puzzle Worksheet 功能存在。");
      }
      const uploadData = await uploadPuzzleImageFile(file);
      const sortOrder = nextSortOrderRef.current;
      nextSortOrderRef.current += 1;
      const createResponse = await fetch("/api/admin/imgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: categoryId,
          active_id: puzzleActive.id,
          image_url: uploadData.image_url,
          image_url_card: uploadData.image_url_card,
          local_file_path: uploadData.local_file_path,
          local_file_path_card: uploadData.local_file_path_card,
          title: titleFromFileName(file.name),
          slug: getBaseFileName(file.name),
          description: null,
          difficulty: useDifficulty ? difficulty : null,
          sort_order: sortOrder,
          is_active: true,
        }),
      });
      const createData = (await createResponse.json()) as
        | ImgListItem
        | { error: string };
      if (!createResponse.ok || "error" in createData) {
        throw new Error("error" in createData ? createData.error : "创建图片记录失败。");
      }
      return createData as ImgListItem;
    },
    [activeDifficulty, categoryId, puzzleActive, uploadPuzzleImageFile, useDifficulty],
  );

  const uploadProps = useMemo<UploadProps>(
    () => ({
      accept: "image/*",
      multiple: true,
      showUploadList: true,
      customRequest: async ({ file, onError, onSuccess }) => {
        try {
          if (!(file instanceof File)) {
            throw new Error("无效的图片文件。");
          }
          await createPuzzleWorksheetItem(file, activeDifficulty);
          onSuccess?.({}, file);
          messageApi.success(`${file.name} 已上传。`);
          window.dispatchEvent(new CustomEvent("admin-local-changes"));
          await fetchItems();
        } catch (error) {
          const messageText =
            error instanceof Error ? error.message : "上传 Puzzle Worksheet 图片失败。";
          messageApi.error(messageText);
          onError?.(new Error(messageText));
        }
      },
    }),
    [activeDifficulty, createPuzzleWorksheetItem, fetchItems, messageApi],
  );

  const deleteItems = useCallback(
    async (ids: number[]) => {
      const uniqueIds = [
        ...new Set(ids.filter((id) => Number.isInteger(id) && id > 0)),
      ];
      if (uniqueIds.length === 0) {
        return;
      }

      const response =
        uniqueIds.length === 1
          ? await fetch(`/api/admin/imgs/${uniqueIds[0]}`, { method: "DELETE" })
          : await fetch("/api/admin/imgs/batch", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ids: uniqueIds }),
            });
      const data = (await response.json()) as
        | { success?: boolean; deleted?: number }
        | { error?: string };
      if (!response.ok) {
        throw new Error("error" in data ? data.error : "删除图片失败。");
      }

      messageApi.success(
        uniqueIds.length === 1
          ? "图片已删除。"
          : `已删除 ${"deleted" in data ? data.deleted ?? uniqueIds.length : uniqueIds.length} 张图片。`,
      );
      setSelectedImgIds((current) =>
        current.filter((id) => !uniqueIds.includes(id)),
      );
      window.dispatchEvent(new CustomEvent("admin-local-changes"));
      await fetchItems();
    },
    [fetchItems, messageApi],
  );

  const toggleSelectedImg = useCallback((id: number, checked: boolean) => {
    setSelectedImgIds((current) => {
      if (checked) {
        return current.includes(id) ? current : [...current, id];
      }
      return current.filter((item) => item !== id);
    });
  }, []);

  const visibleItems = useMemo(
    () =>
      useDifficulty
        ? items.filter((item) => item.difficulty === activeDifficulty)
        : items,
    [activeDifficulty, items, useDifficulty],
  );
  const unassignedItems = useMemo(
    () => (useDifficulty ? items.filter((item) => item.difficulty === null) : []),
    [items, useDifficulty],
  );
  const visibleSelectedImgIds = useMemo(
    () => visibleItems.filter((item) => selectedImgIds.includes(item.id)).map((item) => item.id),
    [selectedImgIds, visibleItems],
  );
  const allVisibleItemsSelected =
    visibleItems.length > 0 && visibleSelectedImgIds.length === visibleItems.length;

  const uploadAnswer = useCallback(
    async (
      item: ImgListItem,
      file: File,
      options?: { silent?: boolean; refresh?: boolean },
    ) => {
      if (!categoryId) {
        throw new Error("请先保存当前三级分类，再上传答案图。");
      }
      if (!puzzleActive) {
        throw new Error("缺少功能 Puzzle Worksheet，请先在功能管理中新增。");
      }

      const uploadData = await uploadPuzzleImageFile(file);

      const updateResponse = await fetch(`/api/admin/imgs/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category_id: item.category_id,
          active_id: item.active_id,
          image_url: item.image_url,
          image_url_card: item.image_url_card,
          local_file_path: item.local_file_path,
          local_file_path_card: item.local_file_path_card,
          answer_image_url: uploadData.image_url,
          answer_local_file_path: uploadData.local_file_path,
          title: item.title,
          slug: item.slug,
          description: item.description,
          difficulty: item.difficulty,
          sort_order: item.sort_order,
          is_active: item.is_active,
        }),
      });
      const updateData = (await updateResponse.json()) as
        | ImgListItem
        | { error?: string };
      if (!updateResponse.ok || "error" in updateData) {
        throw new Error("error" in updateData ? updateData.error : "保存答案图失败。");
      }

      if (!options?.silent) {
        messageApi.success(`${item.title || item.slug || "题图"} 的答案已上传。`);
      }
      window.dispatchEvent(new CustomEvent("admin-local-changes"));
      if (options?.refresh !== false) {
        await fetchItems();
      }
    },
    [categoryId, fetchItems, messageApi, puzzleActive, uploadPuzzleImageFile],
  );

  const handleDirectoryFiles = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) {
        return;
      }
      if (!categoryId || !puzzleActive) {
        messageApi.warning("请先保存当前三级分类，并确认 Puzzle Worksheet 功能存在。");
        return;
      }

      const files = Array.from(fileList).filter(isImageFile);
      const puzzleFiles = files
        .filter((file) => /(^|\/)puzzles\//i.test(getFileRelativePath(file)))
        .sort((a, b) => getFileRelativePath(a).localeCompare(getFileRelativePath(b)));
      const answerFiles = files
        .filter((file) => /(^|\/)answers\//i.test(getFileRelativePath(file)))
        .sort((a, b) => getFileRelativePath(a).localeCompare(getFileRelativePath(b)));

      if (puzzleFiles.length === 0 && answerFiles.length === 0) {
        messageApi.warning("请选择包含 puzzles 和 answers 子目录的根目录。");
        return;
      }

      setProcessingDirectory(true);
      try {
        const createdByKey = new Map<string, ImgListItem>();
        const existingByKey = new Map<string, ImgListItem>();
        items.forEach((item) => {
          const key = (item.slug || item.title || "")
            .toLowerCase()
            .replace(/\.[^.]+$/i, "")
            .replace(/[_-]+answers?$/i, "")
            .replace(/[_-]+solution$/i, "")
            .replace(/[_-]+key$/i, "")
            .replace(/[^a-z0-9]+/gi, "-")
            .replace(/^-+|-+$/g, "");
          if (key) {
            existingByKey.set(key, item);
          }
        });

        for (const file of puzzleFiles) {
          const item = await createPuzzleWorksheetItem(file, activeDifficulty);
          createdByKey.set(getPuzzlePairKey(file), item);
        }

        let answerCount = 0;
        let unmatchedAnswerCount = 0;
        for (const file of answerFiles) {
          const key = getPuzzlePairKey(file);
          const item = createdByKey.get(key) ?? existingByKey.get(key);
          if (!item) {
            unmatchedAnswerCount += 1;
            continue;
          }
          await uploadAnswer(item, file, { silent: true, refresh: false });
          answerCount += 1;
        }

        window.dispatchEvent(new CustomEvent("admin-local-changes"));
        await fetchItems();
        messageApi.success(
          `目录处理完成：上传题图 ${puzzleFiles.length} 张，绑定答案 ${answerCount} 张${
            unmatchedAnswerCount > 0 ? `，未匹配答案 ${unmatchedAnswerCount} 张` : ""
          }。`,
        );
      } catch (error) {
        messageApi.error(
          error instanceof Error ? error.message : "处理目录上传失败。",
        );
      } finally {
        setProcessingDirectory(false);
      }
    },
    [
      categoryId,
      activeDifficulty,
      createPuzzleWorksheetItem,
      fetchItems,
      items,
      messageApi,
      puzzleActive,
      uploadAnswer,
    ],
  );

  return (
    <>
      {contextHolder}
      <Divider>Puzzles 题目图</Divider>
      <Card
        title={title}
        variant="borderless"
        loading={loading}
      >
        <Space orientation="vertical" size={12} style={{ width: "100%" }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
            {description}
          </Typography.Paragraph>
          {puzzleActive ? (
            <Typography.Text type="secondary">
              当前功能：{puzzleActive.name} ({puzzleActive.slug}) · 已有 {items.length} 张
            </Typography.Text>
          ) : (
            <Typography.Text type="danger">
              缺少功能 Puzzle Worksheet，请先在功能管理中新增 slug 为 puzzle-worksheet 的功能。
            </Typography.Text>
          )}
          {useDifficulty ? (
            <Typography.Text type="secondary">
              请选择难度 Tab 后上传；目录批量上传和单张上传都会写入当前 Tab 的难度。根目录需包含
              puzzles 和 answers 子目录，系统会按文件名自动绑定答案图。
            </Typography.Text>
          ) : (
            <Typography.Text type="secondary">
              这个分类不使用难度；目录批量上传和单张上传都会保存为无难度题图。根目录需包含
              puzzles 和 answers 子目录，系统会按文件名自动绑定答案图。
            </Typography.Text>
          )}
          <input
            ref={(node) => {
              directoryInputRef.current = node;
              if (node) {
                node.setAttribute("webkitdirectory", "");
                node.setAttribute("directory", "");
              }
            }}
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(event) => {
              void handleDirectoryFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
          {useDifficulty ? (
            <Tabs
              activeKey={String(activeDifficulty)}
              onChange={(key) => {
                setActiveDifficulty(Number(key));
              }}
              items={IMG_DIFFICULTY_OPTIONS.map((option) => {
                const count = items.filter((item) => item.difficulty === option.value).length;
                const meta = IMG_DIFFICULTY_LABEL_BY_VALUE[option.value];
                return {
                  key: String(option.value),
                  label: `${option.label}（${count}）`,
                  children: (
                    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
                      <Space wrap>
                        <Tag color={meta.color}>当前上传难度：{meta.label}</Tag>
                        <Button
                          type="primary"
                          loading={processingDirectory}
                          disabled={!categoryId || !puzzleActive}
                          onClick={() => directoryInputRef.current?.click()}
                        >
                          选择根目录上传
                        </Button>
                      </Space>
                      <Upload.Dragger {...uploadProps} disabled={!categoryId || !puzzleActive}>
                        <p className="ant-upload-drag-icon">
                          <UploadOutlined />
                        </p>
                        <p className="ant-upload-text">
                          点击或拖拽上传多个{meta.label}题目图
                        </p>
                        <p className="ant-upload-hint">
                          每张图应是一个单独的题图；批量带答案请优先使用上方“选择根目录上传”。
                        </p>
                      </Upload.Dragger>
                    </Space>
                  ),
                };
              })}
            />
          ) : (
            <Space orientation="vertical" size={12} style={{ width: "100%" }}>
              <Space wrap>
                <Tag>无难度</Tag>
                <Button
                  type="primary"
                  loading={processingDirectory}
                  disabled={!categoryId || !puzzleActive}
                  onClick={() => directoryInputRef.current?.click()}
                >
                  选择根目录上传
                </Button>
              </Space>
              <Upload.Dragger {...uploadProps} disabled={!categoryId || !puzzleActive}>
                <p className="ant-upload-drag-icon">
                  <UploadOutlined />
                </p>
                <p className="ant-upload-text">点击或拖拽上传多个题目图</p>
                <p className="ant-upload-hint">
                  每张图应是一个单独的题图；批量带答案请优先使用上方“选择根目录上传”。
                </p>
              </Upload.Dragger>
            </Space>
          )}
          {unassignedItems.length > 0 ? (
            <Typography.Text type="warning">
              另有 {unassignedItems.length} 张旧图片未设置难度，请进入“编辑图片”补充难度后会自动出现在对应
              Tab。
            </Typography.Text>
          ) : null}
          {visibleItems.length > 0 ? (
            <>
              <Space wrap style={{ justifyContent: "space-between", width: "100%" }}>
                <Space wrap>
                  <Button
                    size="small"
                    onClick={() =>
                      setSelectedImgIds((current) =>
                        allVisibleItemsSelected
                          ? current.filter((id) => !visibleItems.some((item) => item.id === id))
                          : [
                              ...current,
                              ...visibleItems
                                .map((item) => item.id)
                                .filter((id) => !current.includes(id)),
                            ],
                      )
                    }
                  >
                    {allVisibleItemsSelected ? "取消全选" : "全选"}
                  </Button>
                  <Typography.Text type="secondary">
                    {useDifficulty ? "当前难度" : "当前分类"}已选 {visibleSelectedImgIds.length} / {visibleItems.length} 张
                  </Typography.Text>
                </Space>
                {visibleSelectedImgIds.length > 0 ? (
                  <Popconfirm
                    title={`确认删除${useDifficulty ? "当前难度" : "当前分类"}选中的 ${visibleSelectedImgIds.length} 张 Puzzle Worksheet 图片吗？`}
                    description="会同时移除题图记录及其答案图关联，删除后不可恢复。"
                    okText="删除"
                    okButtonProps={{ danger: true }}
                    cancelText="取消"
                    onConfirm={() => void deleteItems(visibleSelectedImgIds)}
                  >
                    <Button size="small" danger>
                      批量删除（{visibleSelectedImgIds.length}）
                    </Button>
                  </Popconfirm>
                ) : null}
              </Space>
              <div
                style={{
                  display: "grid",
                  gap: 16,
                  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                  marginTop: 8,
                }}
              >
                {visibleItems.map((item) => {
                const previewUrl = buildPuzzleWorksheetPreviewUrl(item);
                const downloadUrl = buildPuzzleWorksheetDownloadUrl(item);
                const answerUrl = item.answer_image_url
                  ? buildPuzzleWorksheetAnswerPreviewUrl(item)
                  : null;
                const answerDownloadUrl = item.answer_image_url
                  ? buildPuzzleWorksheetAnswerDownloadUrl(item)
                  : null;
                const title = item.title || item.slug || `图片 ${item.id}`;
                const selected = selectedImgIds.includes(item.id);
                const difficultyMeta = item.difficulty
                  ? IMG_DIFFICULTY_LABEL_BY_VALUE[item.difficulty]
                  : null;

                return (
                  <Card
                    key={item.id}
                    size="small"
                    variant="outlined"
                    styles={{
                      body: {
                        border: selected ? "1px solid #1677ff" : undefined,
                        borderRadius: 8,
                        padding: 10,
                      },
                    }}
                  >
                    <Space
                      orientation="vertical"
                      size={8}
                      style={{ width: "100%" }}
                    >
                      <div
                        style={{
                          alignItems: "center",
                          background: "#fafafa",
                          border: "1px solid #f0f0f0",
                          borderRadius: 8,
                          display: "flex",
                          height: 140,
                          justifyContent: "center",
                          overflow: "hidden",
                          position: "relative",
                        }}
                      >
                        <label
                          style={{
                            alignItems: "center",
                            background: "rgba(255,255,255,0.9)",
                            borderRadius: 8,
                            display: "flex",
                            gap: 6,
                            left: 8,
                            padding: "4px 6px",
                            position: "absolute",
                            top: 8,
                            zIndex: 2,
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={(event) =>
                              toggleSelectedImg(item.id, event.target.checked)
                            }
                          />
                          <Typography.Text style={{ fontSize: 12 }}>
                            选择
                          </Typography.Text>
                        </label>
                        {previewUrl ? (
                          <Image
                            alt={title}
                            src={previewUrl}
                            width="100%"
                            height={140}
                            style={{ objectFit: "contain" }}
                          />
                        ) : (
                          <Typography.Text type="secondary">
                            暂无预览
                          </Typography.Text>
                        )}
                      </div>
                      <Typography.Text
                        strong
                        ellipsis={{ tooltip: title }}
                        style={{ width: "100%" }}
                      >
                        {title}
                      </Typography.Text>
                      <Space wrap size={6}>
                        <Tag color={item.is_active ? "green" : "default"}>
                          {item.is_active ? "启用" : "停用"}
                        </Tag>
                        <Tag>排序 {item.sort_order}</Tag>
                        {difficultyMeta ? (
                          <Tag color={difficultyMeta.color}>{difficultyMeta.label}</Tag>
                        ) : null}
                      </Space>
                      <Link href={`/admin/imgs/${item.id}`}>
                        <Button size="small" block>
                          编辑图片
                        </Button>
                      </Link>
                      {downloadUrl ? (
                        <a href={downloadUrl} download>
                          <Button size="small" block>
                            下载题图
                          </Button>
                        </a>
                      ) : null}
                      {answerDownloadUrl ? (
                        <a href={answerDownloadUrl} download>
                          <Button size="small" block>
                            下载答案图
                          </Button>
                        </a>
                      ) : null}
                      {answerUrl ? (
                        <Button
                          size="small"
                          block
                          onClick={() => setAnswerPreview({ title, url: answerUrl })}
                        >
                          查看答案
                        </Button>
                      ) : null}
                      <Upload
                        accept="image/*"
                        showUploadList={false}
                        customRequest={async ({ file, onError, onSuccess }) => {
                          try {
                            if (!(file instanceof File)) {
                              throw new Error("无效的答案图片文件。");
                            }
                            await uploadAnswer(item, file);
                            onSuccess?.({}, file);
                          } catch (error) {
                            const messageText =
                              error instanceof Error ? error.message : "上传答案图失败。";
                            messageApi.error(messageText);
                            onError?.(new Error(messageText));
                          }
                        }}
                      >
                        <Button size="small" block>
                          {answerUrl ? "替换答案" : "上传答案"}
                        </Button>
                      </Upload>
                      <Popconfirm
                        title="确认删除这张 Puzzle Worksheet 图片吗？"
                        description="会同时移除这张题图记录及其答案图关联。"
                        okText="删除"
                        okButtonProps={{ danger: true }}
                        cancelText="取消"
                        onConfirm={() => void deleteItems([item.id])}
                      >
                        <Button size="small" block danger>
                          删除图片
                        </Button>
                      </Popconfirm>
                    </Space>
                  </Card>
                );
                })}
              </div>
            </>
          ) : (
            <Typography.Text type="secondary">
              {useDifficulty
                ? "当前难度还没有 Puzzle Worksheet 图片，可以直接上传，也可以先切换到其他难度查看。"
                : "当前分类还没有 Puzzle Worksheet 图片，可以直接上传。"}
            </Typography.Text>
          )}
        </Space>
      </Card>
      <Modal
        title={answerPreview ? `${answerPreview.title} · 答案` : "答案"}
        open={Boolean(answerPreview)}
        footer={null}
        onCancel={() => setAnswerPreview(null)}
        width={720}
        destroyOnHidden
      >
        {answerPreview ? (
          <Image
            alt={`${answerPreview.title} 答案`}
            src={answerPreview.url}
            style={{ width: "100%" }}
          />
        ) : null}
      </Modal>
    </>
  );
}

export function CategoryFormPage({
  categoryId,
  initialFlat,
  activeItems,
  availableActives,
  initialValues,
  backHref = "/admin/categories",
  lockParentSelection = false,
}: CategoryFormPageProps) {
  const { message: messageApi, modal } = App.useApp();
  const [form] = Form.useForm<CategoryFormValues>();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [generatingAllImgs, setGeneratingAllImgs] = useState(false);
  const isEdit = typeof categoryId === "number";
  const selectedParentId = Form.useWatch("parent_id", form);
  const selectedCoverImageId = Form.useWatch("cover_image", form);
  const watchedCategoryName = Form.useWatch("name", form);
  const watchedNameZh = Form.useWatch("name_zh", form);
  const watchedSlug = Form.useWatch("slug", form);
  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [lineArtModalOpen, setLineArtModalOpen] = useState(false);
  const [descPromptModalOpen, setDescPromptModalOpen] = useState(false);
  const [posePromptModalOpen, setPosePromptModalOpen] = useState(false);
  const [poseSpecsInput, setPoseSpecsInput] = useState("");
  const [currentPosePromptSpecs, setCurrentPosePromptSpecs] = useState(
    initialValues.pose_prompt_specs ?? null,
  );
  const [savingPosePromptSpecs, setSavingPosePromptSpecs] = useState(false);
  const promptTheme = useMemo(
    () => buildCoverPromptTheme(watchedCategoryName || initialValues.name),
    [initialValues.name, watchedCategoryName],
  );

  useEffect(() => {
    form.setFieldsValue(initialValues);
    setCurrentPosePromptSpecs(initialValues.pose_prompt_specs ?? null);
  }, [form, initialValues]);

  const categoryMap = useMemo(
    () => new Map(initialFlat.map((item) => [item.id, item])),
    [initialFlat],
  );
  /** 编辑页：当前分类是否仍有待同步的本地变更（一级～三级同一规则） */
  const editCategoryPendingSync = useMemo(() => {
    if (!isEdit || !categoryId) {
      return false;
    }
    const row = categoryMap.get(categoryId);
    if (!row) {
      return false;
    }
    const t = row.local_change_type;
    return t === "created" || t === "updated" || t === "conflict";
  }, [categoryId, categoryMap, isEdit]);
  const childrenMap = useMemo(() => {
    const nextMap = new Map<number, number[]>();
    initialFlat.forEach((item) => {
      if (item.parent_id === null) {
        return;
      }
      const siblingIds = nextMap.get(item.parent_id) ?? [];
      siblingIds.push(item.id);
      nextMap.set(item.parent_id, siblingIds);
    });
    return nextMap;
  }, [initialFlat]);
  const blockedParentIds = useMemo(
    () =>
      categoryId
        ? collectDescendantIds(categoryId, childrenMap)
        : new Set<number>(),
    [categoryId, childrenMap],
  );
  const parentOptions = useMemo(
    () =>
      initialFlat
        .filter((item) => {
          if (item.id === categoryId || blockedParentIds.has(item.id)) {
            return false;
          }
          return getCategoryDepth(item, categoryMap) < 3;
        })
        .map((item) => {
          const depth = getCategoryDepth(item, categoryMap);
          return {
            value: item.id,
            label: `${"— ".repeat(Math.max(0, depth - 1))}${item.name}`,
          };
        }),
    [blockedParentIds, categoryId, categoryMap, initialFlat],
  );
  const currentLevel = useMemo(() => {
    const effectiveParentId = lockParentSelection
      ? (initialValues.parent_id ?? null)
      : (selectedParentId ?? null);
    if (!effectiveParentId) {
      return 1;
    }
    const parent = categoryMap.get(effectiveParentId);
    return parent ? getCategoryDepth(parent, categoryMap) + 1 : 1;
  }, [
    categoryMap,
    initialValues.parent_id,
    lockParentSelection,
    selectedParentId,
  ]);
  const currentParentChain = useMemo(() => {
    const effectiveParentId = lockParentSelection
      ? (initialValues.parent_id ?? null)
      : (selectedParentId ?? null);
    return collectAncestorNames(effectiveParentId, categoryMap);
  }, [
    categoryMap,
    initialValues.parent_id,
    lockParentSelection,
    selectedParentId,
  ]);
  const currentParentRecords = useMemo(() => {
    const effectiveParentId = lockParentSelection
      ? (initialValues.parent_id ?? null)
      : (selectedParentId ?? initialValues.parent_id ?? null);
    return collectAncestorRecords(effectiveParentId, categoryMap);
  }, [
    categoryMap,
    initialValues.parent_id,
    lockParentSelection,
    selectedParentId,
  ]);
  const isPuzzlesThirdLevel =
    currentLevel === 3 && currentParentRecords[0]?.slug === "puzzles";
  const isBlankGridsThirdLevel =
    isPuzzlesThirdLevel && currentParentRecords[1]?.slug === "blank-grids";
  const coverPromptTexts = useMemo(
    () =>
      buildCoverPromptTexts({
        theme: promptTheme,
        level: currentLevel,
        ancestors: currentParentChain,
      }),
    [currentLevel, currentParentChain, promptTheme],
  );
  const levelLabel =
    currentLevel === 1 ? "一级" : currentLevel === 2 ? "二级" : "三级";
  const lockedParent =
    lockParentSelection && initialValues.parent_id
      ? (categoryMap.get(initialValues.parent_id) ?? null)
      : null;
  // 一级～三级均使用同一套封面图上传。
  const shouldShowCoverUpload = currentLevel >= 1 && currentLevel <= 3;
  const descriptionPlaceholder =
    currentLevel === 3
      ? "例如：The T-Rex was a large meat-eating dinosaur from the Late Cretaceous period."
      : "例如：Printable Space resources for kids, including coloring pages, cut-outs, and simple facts.";

  const effectiveParentForPrompt = lockParentSelection
    ? (initialValues.parent_id ?? null)
    : (selectedParentId ?? initialValues.parent_id ?? null);
  const categoryDescAiPrompt = useMemo(() => {
    const name =
      watchedCategoryName?.trim() || initialValues.name?.trim() || "";
    const nameZh =
      (typeof watchedNameZh === "string" ? watchedNameZh : "") ||
      initialValues.name_zh ||
      "";
    const slug =
      (typeof watchedSlug === "string" ? watchedSlug : "") ||
      initialValues.slug ||
      "";
    const ancestors = collectAncestorNames(
      effectiveParentForPrompt,
      categoryMap,
    );
    const poseTerms = extractPoseSeoTerms(currentPosePromptSpecs);
    return buildCategoryDescriptionAiPrompt({
      level: currentLevel,
      name,
      nameZh,
      slug,
      ancestors,
      availableActives,
      poseTerms,
    });
  }, [
    availableActives,
    categoryMap,
    currentPosePromptSpecs,
    currentLevel,
    effectiveParentForPrompt,
    initialValues.name,
    initialValues.name_zh,
    initialValues.slug,
    watchedCategoryName,
    watchedNameZh,
    watchedSlug,
  ]);
  const poseInfoGeneratorPrompt = useMemo(() => {
    const theme = watchedCategoryName?.trim() || initialValues.name?.trim() || "";
    const ancestors = collectAncestorNames(
      effectiveParentForPrompt,
      categoryMap,
    );

    return buildPoseInfoGeneratorPrompt({
      theme,
      ancestors,
    });
  }, [
    categoryMap,
    effectiveParentForPrompt,
    initialValues.name,
    watchedCategoryName,
  ]);
  const syncImgSourcePromptPlans = useCallback(
    async (
      targetCategoryId: number,
      plans: ImgSourcePromptPlan[],
      options?: {
        replaceExisting?: boolean;
      },
    ) => {
      const response = await fetch(
        `/api/admin/categories/${targetCategoryId}/img-source-prompts`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: plans,
            replace_existing: options?.replaceExisting === true,
          }),
        },
      );
      const data = (await response.json()) as
        | { items: unknown[] }
        | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error(
          "error" in data ? data.error : "保存原始图提示词失败。",
        );
      }
    },
    [],
  );
  const saveCategoryPosePromptSpecs = useCallback(
    async (targetCategoryId: number, specsJson: string) => {
      const response = await fetch(
        `/api/admin/categories/${targetCategoryId}/pose-prompt-specs`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pose_prompt_specs: specsJson,
          }),
        },
      );
      const data = (await response.json()) as CategoryRecord | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "保存姿态信息失败。");
      }
    },
    [],
  );
  const getExistingImgSourceDataState = useCallback(
    async (targetCategoryId: number) => {
      const [sourceResponse, imgResponse] = await Promise.all([
        fetch(`/api/admin/img-sources?category_id=${targetCategoryId}`, {
          cache: "no-store",
        }),
        fetch(`/api/admin/imgs?category_id=${targetCategoryId}`, {
          cache: "no-store",
        }),
      ]);
      const [sourceData, imgData] = (await Promise.all([
        sourceResponse.json(),
        imgResponse.json(),
      ])) as [
        ImgSourceListResponse | { error?: string },
        CategoryImgListResponse | { error?: string },
      ];

      if (!sourceResponse.ok || !("items" in sourceData)) {
        throw new Error(
          "error" in sourceData ? sourceData.error : "获取原图数据失败。",
        );
      }

      if (!imgResponse.ok || !("items" in imgData)) {
        throw new Error(
          "error" in imgData ? imgData.error : "获取功能图数据失败。",
        );
      }

      const uploadedSourceCount = sourceData.items.filter(
        (item) => item.image_url?.trim() && item.local_file_path?.trim(),
      ).length;
      const promptOnlySourceCount = sourceData.items.length - uploadedSourceCount;
      const generatedImgCount = imgData.items.length;

      return {
        hasExistingData: sourceData.items.length > 0 || generatedImgCount > 0,
        sourceCount: sourceData.items.length,
        uploadedSourceCount,
        promptOnlySourceCount,
        generatedImgCount,
      };
    },
    [],
  );
  const buildReplaceExistingImgSourceMessage = useCallback(
    (state: ExistingImgSourceDataState) =>
      `当前分类已有 ${state.sourceCount} 条原始图记录（其中 ${state.uploadedSourceCount} 条已上传原图、${state.promptOnlySourceCount} 条仅提示词记录），以及 ${state.generatedImgCount} 张功能图。继续后会清空这些原始图记录；若有已上传原图，则同时删除本地原图文件；若有功能图，则会删除对应功能图数据并进入同步队列，后续同步时会删除线上对应数据。`,
    [],
  );
  const confirmReplaceExistingImgSourceData = useCallback(
    async (targetCategoryId: number) => {
      const state = await getExistingImgSourceDataState(targetCategoryId);

      if (!state.hasExistingData) {
        return {
          ...state,
          shouldReplaceExisting: false,
        };
      }

      const shouldReplaceExisting = await new Promise<boolean>((resolve) => {
        const instance = modal.confirm({
          title: "确认覆盖当前原图数据吗？",
          content: buildReplaceExistingImgSourceMessage(state),
          okText: "确认覆盖",
          cancelText: "取消",
          okButtonProps: { danger: true },
          onOk: () => {
            resolve(true);
            instance.destroy();
          },
          onCancel: () => {
            resolve(false);
            instance.destroy();
          },
        });
      });

      return {
        ...state,
        shouldReplaceExisting,
      };
    },
    [buildReplaceExistingImgSourceMessage, getExistingImgSourceDataState, modal],
  );
  const savePosePromptData = useCallback(
    async (input: {
      targetCategoryId: number;
      theme: string;
      ancestors: string[];
      specs: PosePromptSpec[];
      replaceExisting: boolean;
    }) => {
      const specsJson = serializePosePromptSpecs(input.specs);
      const nextVariants = buildPosePromptVariants({
        theme: input.theme,
        ancestors: input.ancestors,
        specs: input.specs,
      });
      const promptPlans = buildImgSourcePromptPlans({
        theme: input.theme,
        ancestors: input.ancestors,
        variants: nextVariants,
      });
      await saveCategoryPosePromptSpecs(input.targetCategoryId, specsJson);
      await syncImgSourcePromptPlans(input.targetCategoryId, promptPlans, {
        replaceExisting: input.replaceExisting,
      });
      setCurrentPosePromptSpecs(specsJson);
    },
    [saveCategoryPosePromptSpecs, syncImgSourcePromptPlans],
  );
  const handleBuildPosePrompts = useCallback(async () => {
    const theme = watchedCategoryName?.trim() || initialValues.name?.trim() || "";
    const ancestors = collectAncestorNames(
      effectiveParentForPrompt,
      categoryMap,
    );

    if (!theme) {
      messageApi.warning("请先填写当前三级分类名称。");
      return;
    }

    if (!isEdit || !categoryId || currentLevel !== 3) {
      messageApi.warning("请先保存当前三级分类，再生成并写入原始图表。");
      return;
    }

    try {
      const specs = parsePosePromptSpecs(poseSpecsInput);
      const replaceState = await confirmReplaceExistingImgSourceData(
        categoryId,
      );

      if (
        replaceState.hasExistingData &&
        !replaceState.shouldReplaceExisting
      ) {
        return;
      }
      setSavingPosePromptSpecs(true);
      await savePosePromptData({
        targetCategoryId: categoryId,
        theme,
        ancestors,
        specs,
        replaceExisting: replaceState.hasExistingData,
      });
      window.dispatchEvent(new CustomEvent("admin-local-changes"));
      messageApi.success(
        replaceState.hasExistingData
          ? "已清空原图及对应功能图数据，并覆盖写入新的姿态数据与原始图提示词记录。"
          : "已根据 JSON 生成并写入姿态数据与原始图提示词记录。",
      );
    } catch (error) {
      const text =
        error instanceof Error ? error.message : "姿态信息解析失败，请检查 JSON 格式。";
      messageApi.error(text);
    } finally {
      setSavingPosePromptSpecs(false);
    }
  }, [
    categoryMap,
    categoryId,
    currentLevel,
    effectiveParentForPrompt,
    initialValues.name,
    isEdit,
    messageApi,
    poseSpecsInput,
    confirmReplaceExistingImgSourceData,
    savePosePromptData,
    watchedCategoryName,
  ]);
  const handlePosePromptButtonClick = useCallback(() => {
    setPosePromptModalOpen(true);
  }, []);
  const removePendingImageIfNeeded = useCallback(async (id: string) => {
    await fetch("/api/admin/images/upload/staged", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        local_file_path: buildPendingCategoryImagePath(id),
      }),
    });
  }, []);

  const stageCategoryImage = useCallback(
    async (
      file: File,
      options?: {
        normalize?: boolean;
        preset?: GeneratedUploadPreset;
      },
    ) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("normalize", options?.normalize === false ? "0" : "1");
      if (options?.preset) {
        formData.append("preset", options.preset);
      }

      const response = await fetch("/api/admin/categories/images/upload", {
        method: "POST",
        body: formData,
      });
      const data = (await response.json()) as
        | { id: string; local_file_path: string; file_name: string }
        | { error: string };

      if (!response.ok || "error" in data) {
        throw new Error("error" in data ? data.error : "上传分类图片失败。");
      }

      return data.id;
    },
    [],
  );

  const coverUploadProps = useMemo<UploadProps>(
    () => ({
      accept: "image/*",
      maxCount: 1,
      customRequest: async ({ file, onError, onSuccess }) => {
        try {
          if (!(file instanceof File)) {
            throw new Error("无效的图片文件。");
          }
          // 封面图单独走多尺寸裁切与 WebP 预处理：256 / 512 / 1024。
          const nextId = await stageCategoryImage(file, { preset: "cover" });
          form.setFieldValue("cover_image", nextId);
          form.setFieldValue("seo_image_url", undefined);
          // 让 Upload 结束 loading；第二参数传入 file 避免受控列表卡在「上传中」
          onSuccess?.({}, file);
          messageApi.success("封面图已上传，将生成 256 / 512 / 1024 三种尺寸，请记得点击底部「保存」。");
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "上传封面图失败，请稍后重试。";
          messageApi.error(errorMessage);
          onError?.(new Error(errorMessage));
        }
      },
      fileList: selectedCoverImageId
        ? [
            {
              uid: selectedCoverImageId,
              name: getUploadFileName(selectedCoverImageId),
              status: "done",
              url: buildCategoryImagePreviewUrl(selectedCoverImageId),
              thumbUrl: buildCategoryImagePreviewUrl(selectedCoverImageId),
            },
          ]
        : [],
      onRemove: async () => {
        if (!selectedCoverImageId) {
          return true;
        }

        try {
          await removePendingImageIfNeeded(selectedCoverImageId);
          form.setFieldValue("cover_image", undefined);
          form.setFieldValue("seo_image_url", undefined);
          messageApi.success("封面图已移除，请记得点击底部「保存」。");
          return true;
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "移除封面图失败，请稍后重试。";
          messageApi.error(errorMessage);
          return false;
        }
      },
      showUploadList: true,
      listType: "picture-card",
      onPreview: async (file) => {
        const previewUrl = file.url || file.thumbUrl;
        if (!previewUrl) {
          return;
        }

        window.open(previewUrl, "_blank", "noopener,noreferrer");
      },
    }),
    [
      form,
      messageApi,
      removePendingImageIfNeeded,
      selectedCoverImageId,
      stageCategoryImage,
    ],
  );

  const handleSave = useCallback(
    async (values: CategoryFormValues) => {
      const submitValues = { ...values };
      delete submitValues.pose_prompt_specs;
      // 一级/二级封面仅通过 Upload + setFieldValue 更新时，若未用 Form.Item 注册，onFinish 里可能拿不到 cover_image
      const coverFromForm =
        typeof values.cover_image === "string"
          ? values.cover_image
          : (form.getFieldValue("cover_image") as string | undefined);

      setSaving(true);

      try {
        const payload = {
          ...submitValues,
          parent_id: lockParentSelection
            ? (initialValues.parent_id ?? null)
            : (values.parent_id ?? null),
          cover_image: coverFromForm?.trim() || null,
          seo_image_url: null,
          name_zh: values.name_zh?.trim() ? values.name_zh.trim() : null,
        };
        const response = await fetch(
          isEdit
            ? `/api/admin/categories/${categoryId}`
            : "/api/admin/categories",
          {
            method: isEdit ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const data = (await response.json()) as
          | CategoryRecord
          | { error: string };

        if (!response.ok || "error" in data) {
          throw new Error("error" in data ? data.error : "保存分类失败。");
        }

        messageApi.success(isEdit ? "分类已更新。" : "分类已创建。");
        window.dispatchEvent(new CustomEvent("admin-local-changes"));
        router.push(backHref);
        router.refresh();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "保存分类失败，请稍后重试。";
        messageApi.error(errorMessage);
      } finally {
        setSaving(false);
      }
    },
    [
      backHref,
      categoryId,
      form,
      initialValues.parent_id,
      isEdit,
      lockParentSelection,
      messageApi,
      router,
    ],
  );
  const handleGenerateAllImgs = useCallback(() => {
    if (!isEdit || !categoryId || currentLevel !== 3) {
      messageApi.warning("请先保存当前三级分类，再批量生成功能图。");
      return;
    }

    const categoryName =
      watchedCategoryName?.trim() || initialValues.name?.trim() || "当前三级分类";

    const runGenerate = async () => {
      setGeneratingAllImgs(true);

      try {
        const response = await fetch("/api/admin/img-sources/generate-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category_id: categoryId,
            replace_existing: true,
          }),
        });
        const data = (await response.json()) as GenerateAllImgResponse;

        if (!response.ok) {
          throw new Error(data.error || "批量生成功能图失败。");
        }

        let clientCutCount = 0;
        const generatedItems = data.items ?? [];
        if (generatedItems.length > 0) {
          const [sourcesResponse, activesResponse] = await Promise.all([
            fetch(`/api/admin/img-sources?category_id=${categoryId}`, {
              cache: "no-store",
            }),
            fetch("/api/admin/actives", {
              cache: "no-store",
            }),
          ]);
          const [sourcesData, activesData] = (await Promise.all([
            sourcesResponse.json(),
            activesResponse.json(),
          ])) as [
            ImgSourceListResponse | { error?: string },
            ActiveListResponse | { error?: string },
          ];

          if (!sourcesResponse.ok || !("items" in sourcesData)) {
            throw new Error("error" in sourcesData ? sourcesData.error : "获取原始图列表失败。");
          }

          if (!activesResponse.ok || !("items" in activesData)) {
            throw new Error("error" in activesData ? activesData.error : "获取功能列表失败。");
          }

          clientCutCount = await replaceGeneratedCutImgsWithClientOutput({
            generatedItems,
            sources: sourcesData.items,
            actives: activesData.items,
          });
        }

        messageApi.success(
          clientCutCount > 0
            ? `已删除 ${data.deleted_count ?? 0} 张旧图，生成 ${data.generated_count ?? 0} 张功能图，并已用测试页算法重建 ${clientCutCount} 张剪纸图。`
            : `已删除 ${data.deleted_count ?? 0} 张旧图，生成 ${data.generated_count ?? 0} 张功能图。`,
        );
        window.dispatchEvent(new CustomEvent("admin-local-changes"));
      } catch (error) {
        messageApi.error(
          error instanceof Error ? error.message : "批量生成功能图失败。",
        );
      } finally {
        setGeneratingAllImgs(false);
      }
    };

    void modal.confirm({
      title: "确认一键生成功能图吗？",
      content: `会基于当前三级分类「${categoryName}」下的全部原始图，重新生成功能图并替换旧图。`,
      okText: "确认生成",
      cancelText: "取消",
      onOk: () => {
        window.setTimeout(() => {
          void runGenerate();
        }, 0);
      },
    });
  }, [
    categoryId,
    currentLevel,
    initialValues.name,
    isEdit,
    messageApi,
    modal,
    watchedCategoryName,
  ]);

  return (
    <>
      <Card
        title={
          <Space size={8}>
            <span>{isEdit ? `编辑${levelLabel}分类` : `新增${levelLabel}分类`}</span>
            {editCategoryPendingSync ? (
              <ExclamationCircleFilled style={{ color: "#ff4d4f" }} title="本机有未同步修改" />
            ) : null}
          </Space>
        }
        variant="borderless"
        extra={<Link href={backHref}>返回列表</Link>}
      >
        <Form<CategoryFormValues>
          key={categoryId ?? "new"}
          form={form}
          layout="vertical"
          initialValues={initialValues}
          onFinish={(values) => void handleSave(values)}
        >
          {lockParentSelection ? (
            <Form.Item label="所属上级">
              <Input value={lockedParent?.name ?? "无（一级分类）"} readOnly />
            </Form.Item>
          ) : (
            <Form.Item label="上级分类" name="parent_id">
              <Select
                allowClear
                placeholder="留空表示一级分类"
                options={parentOptions}
              />
            </Form.Item>
          )}

          <Form.Item
            label="分类名称"
            name="name"
            rules={[{ required: true, message: "请输入分类名称" }]}
          >
            <Input
              placeholder={
                currentLevel === 1
                  ? "例如：恐龙"
                  : currentLevel === 2
                    ? "例如：三角龙"
                    : "例如：头部"
              }
            />
          </Form.Item>

          <Form.Item label="Slug" name="slug">
            <Input placeholder="留空时自动生成" />
          </Form.Item>

          <Form.Item
            label="中文名称（仅本地）"
            name="name_zh"
            extra="仅写入本机 SQLite，不会同步到线上 D1；用于后台识别或后续本地展示。"
          >
            <Input placeholder="例如：霸王龙" allowClear />
          </Form.Item>

          <Form.Item
            label="前台英文文案"
            extra="请写一句英文说明；在 PrintlyKiddo 会与标题一起出现在页头。可用「AI 提示词」复制整段提示到 ChatGPT 等工具生成后再粘贴回来。"
          >
            <Space orientation="vertical" size={8} style={{ width: "100%" }}>
              <Form.Item name="description" noStyle>
                <Input.TextArea rows={4} placeholder={descriptionPlaceholder} />
              </Form.Item>
              <Button type="link" onClick={() => setDescPromptModalOpen(true)}>
                AI 提示词
              </Button>
            </Space>
          </Form.Item>

          {shouldShowCoverUpload ? (
            <>
              {/* 注册 cover_image，确保保存时提交到 API；保存后会补齐本地镜像，后续同步再上传到 R2。 */}
              <Form.Item name="cover_image" hidden>
                <Input type="hidden" />
              </Form.Item>
              <Form.Item name="seo_image_url" hidden>
                <Input type="hidden" />
              </Form.Item>
              <Form.Item
                label="封面图"
                extra="上传一张大图即可；系统会转为 WebP 并派生 256 / 512 / 1024 三种尺寸。256 用于分类卡片，1024 自动作为页面主图、OG、结构化数据和 sitemap image。"
              >
                <Space align="start" wrap>
                  <Upload {...coverUploadProps}>
                    {!selectedCoverImageId ? (
                      <button
                        type="button"
                        style={{
                          border: 0,
                          background: "none",
                          cursor: "pointer",
                        }}
                      >
                        <UploadOutlined />
                        <div style={{ marginTop: 8 }}>上传封面图</div>
                      </button>
                    ) : null}
                  </Upload>
                  <Button onClick={() => setPromptModalOpen(true)}>
                    AI 提示词
                  </Button>
                </Space>
              </Form.Item>
            </>
          ) : null}

          <Modal
            title="封面图 AI 提示词"
            open={promptModalOpen}
            onCancel={() => setPromptModalOpen(false)}
            footer={[
              <Button key="close" onClick={() => setPromptModalOpen(false)}>
                关闭
              </Button>,
            ]}
            width={820}
          >
            <Space orientation="vertical" size={16} style={{ width: "100%" }}>
              <Typography.Text type="secondary">
                当前主题：{promptTheme} · 当前层级：{levelLabel}
              </Typography.Text>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                复制下方整段提示词到 ChatGPT / Gemini 等工具，可生成更适合分类导航卡片和页头使用的封面图。
              </Typography.Paragraph>
              <div>
                <Typography.Title level={5}>中文版</Typography.Title>
                <Typography.Paragraph
                  copyable={{ text: coverPromptTexts.chinese }}
                  style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}
                >
                  {coverPromptTexts.chinese}
                </Typography.Paragraph>
              </div>
              <div>
                <Typography.Title level={5}>English</Typography.Title>
                <Typography.Paragraph
                  copyable={{ text: coverPromptTexts.english }}
                  style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}
                >
                  {coverPromptTexts.english}
                </Typography.Paragraph>
              </div>
            </Space>
          </Modal>

          <Modal
            title="三级分类姿态信息与提示词"
            open={posePromptModalOpen}
            onCancel={() => setPosePromptModalOpen(false)}
            footer={[
              <Button key="close" onClick={() => setPosePromptModalOpen(false)}>
                关闭
              </Button>,
            ]}
            width={860}
            destroyOnHidden
          >
            <Space orientation="vertical" size={16} style={{ width: "100%" }}>
              <Typography.Text type="secondary">
                当前主题：{watchedCategoryName?.trim() || initialValues.name || "未填写"} ·
                当前层级：三级
              </Typography.Text>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                先复制下面这段“姿态信息生成提示词”去 AI 工具里生成适合当前主题的姿态/状态信息；再把 AI 返回的 JSON 粘贴回来，点击生成。系统会直接把不同原始图类型的提示词写入下方原始图表，后续请在原始图表里点击查看和复制。
              </Typography.Paragraph>
              <div>
                <Typography.Title level={5}>第一步：生成姿态信息</Typography.Title>
                <Typography.Paragraph
                  copyable={{ text: poseInfoGeneratorPrompt }}
                  style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}
                >
                  {poseInfoGeneratorPrompt}
                </Typography.Paragraph>
              </div>
              <div>
                <Typography.Title level={5}>第二步：粘贴 AI 返回的 JSON</Typography.Title>
                <Input.TextArea
                  rows={12}
                  value={poseSpecsInput}
                  onChange={(event) => setPoseSpecsInput(event.target.value)}
                  placeholder='请把 AI 返回的姿态信息 JSON 粘贴到这里，例如：[{"titleZh":"站立侧视","titleEn":"Side Stand"}]'
                />
              </div>
              <Space wrap>
                <Button
                  type="primary"
                  loading={savingPosePromptSpecs}
                  onClick={() => void handleBuildPosePrompts()}
                >
                  生成并写入原始图表提示词
                </Button>
                <Button
                  onClick={() => {
                    setPoseSpecsInput("");
                  }}
                >
                  清空
                </Button>
              </Space>
              <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
                这里不再展示不同类型的原始图提示词，也不记录上一次输入的 JSON。生成完成后，请到下方原始图表中按类型查看、复制和上传原图。
              </Typography.Paragraph>
            </Space>
          </Modal>

          <Modal
            title="线框转化"
            open={lineArtModalOpen}
            onCancel={() => setLineArtModalOpen(false)}
            footer={[
              <Button key="close" onClick={() => setLineArtModalOpen(false)}>
                关闭
              </Button>,
            ]}
            width={820}
          >
            <Space orientation="vertical" size={16} style={{ width: "100%" }}>
              <div>
                <Typography.Title level={5}>中文版</Typography.Title>
                <Typography.Paragraph
                  copyable={{ text: LINE_ART_CONVERSION_PROMPTS.chinese }}
                  style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}
                >
                  {LINE_ART_CONVERSION_PROMPTS.chinese}
                </Typography.Paragraph>
              </div>
              <div>
                <Typography.Title level={5}>
                  英文版（推荐用于 AI 工具）
                </Typography.Title>
                <Typography.Paragraph
                  copyable={{ text: LINE_ART_CONVERSION_PROMPTS.english }}
                  style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}
                >
                  {LINE_ART_CONVERSION_PROMPTS.english}
                </Typography.Paragraph>
              </div>
            </Space>
          </Modal>

          <Modal
            title="生成前台英文说明 · AI 提示词"
            open={descPromptModalOpen}
            onCancel={() => setDescPromptModalOpen(false)}
            footer={[
              <Button key="close" onClick={() => setDescPromptModalOpen(false)}>
                关闭
              </Button>,
            ]}
            width={820}
            destroyOnHidden
          >
            <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
              将下方整段复制到你的 AI
              对话中；生成的一句英文再粘贴到「前台英文文案」并保存。提示词已带入当前表单里的名称、中文名、Slug
              与上级路径（随表单变更更新）。
            </Typography.Paragraph>
            <Typography.Paragraph
              copyable={{ text: categoryDescAiPrompt }}
              style={{ whiteSpace: "pre-wrap", marginBottom: 0 }}
            >
              {categoryDescAiPrompt}
            </Typography.Paragraph>
          </Modal>

          {currentLevel === 3 ? (
            isPuzzlesThirdLevel ? (
              <PuzzleWorksheetUploadPanel
                categoryId={categoryId}
                activeItems={activeItems}
                useDifficulty={!isBlankGridsThirdLevel}
                title={isBlankGridsThirdLevel ? "Blank Grid 模板图" : undefined}
                description={
                  isBlankGridsThirdLevel
                    ? "Blank Grids 三级分类不使用原始图、提示词和一键生成功能图。这里会把上传图片直接保存为 Puzzle Worksheet 功能图；可为每张模板单独上传答案图。"
                    : undefined
                }
              />
            ) : (
              <>
              <Divider>分类原始图</Divider>
              <Space wrap style={{ marginBottom: 16 }}>
                <Button
                  type="primary"
                  loading={generatingAllImgs}
                  onClick={() => handleGenerateAllImgs()}
                >
                  一键生成功能图
                </Button>
                <Button
                  onClick={() => {
                    const prompt = buildOutlineVariantPrompt();
                    void navigator.clipboard.writeText(prompt).then(() => messageApi.success("线框图提示词已复制"));
                  }}
                >
                  复制线框图提示词
                </Button>
                <Button
                  onClick={() => {
                    const prompt = buildSceneColorVariantPrompt();
                    void navigator.clipboard.writeText(prompt).then(() => messageApi.success("带背景彩图提示词已复制"));
                  }}
                >
                  复制带背景彩图提示词
                </Button>
                <Button
                  danger
                  onClick={() => {
                    if (!isEdit || !categoryId) return;
                    const categoryName = watchedCategoryName?.trim() || initialValues.name?.trim() || "当前三级分类";
                    void modal.confirm({
                      title: "确认清空所有功能图吗？",
                      content: `会删除「${categoryName}」下的全部功能图，且不可恢复。原始图不受影响。`,
                      okText: "确认清空",
                      okButtonProps: { danger: true },
                      cancelText: "取消",
                      onOk: async () => {
                        try {
                          const response = await fetch(`/api/admin/categories/${categoryId}/clear-assets`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ target: "generated_imgs" }),
                          });
                          const data = (await response.json()) as { deleted_img_count?: number; error?: string };
                          if (!response.ok) throw new Error(data.error || "清空功能图失败。");
                          messageApi.success(`已清空 ${data.deleted_img_count ?? 0} 张功能图。`);
                          window.dispatchEvent(new CustomEvent("admin-local-changes"));
                        } catch (error) {
                          messageApi.error(error instanceof Error ? error.message : "清空功能图失败。");
                        }
                      },
                    });
                  }}
                >
                  清空功能图
                </Button>
                <Button
                  loading={savingPosePromptSpecs}
                  onClick={() => handlePosePromptButtonClick()}
                >
                  姿态提示词
                </Button>
              </Space>
              <ImgSourcesManager categoryId={categoryId} showPromptButtons={false} />
              </>
            )
          ) : null}

          <Form.Item label="排序" name="sort_order">
            <InputNumber style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item label="启用状态" name="is_active" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>

          <Space>
            <Button type="primary" htmlType="submit" loading={saving}>
              保存分类
            </Button>
            <Link href={backHref}>
              <Button>取消</Button>
            </Link>
          </Space>
        </Form>
      </Card>
    </>
  );
}
