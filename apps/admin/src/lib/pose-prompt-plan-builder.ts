/**
 * Server-side prompt plan builder.
 * Converts pose_prompt_specs JSON → ImgSourcePromptPlanInput[].
 * Replicates the logic from category-form-page.tsx for server-side use.
 */

import type { ImgSourcePromptPlanInput } from "@/lib/local-admin-db";

type PosePromptSpec = {
  key?: string;
  titleZh: string;
  titleEn: string;
};

type PosePromptVariant = PosePromptSpec & {
  key: string;
};

function buildCopyPosePrompt(titleZh: string) {
  return `绘制${titleZh.trim()}姿态的图`;
}

function parsePoseSpecs(raw: string): PosePromptSpec[] {
  const normalized = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(normalized) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error(
      `至少需要 1 条姿态信息，实际 ${Array.isArray(parsed) ? parsed.length : "非数组"}`,
    );
  }
  return parsed.map((item: Record<string, unknown>, i: number) => {
    const pick = (k: string) => {
      const v = item[k];
      if (typeof v !== "string" || !v.trim()) {
        throw new Error(`第${i + 1}条缺少${k}`);
      }
      return v.trim();
    };
    const rawKey = item.key;
    return {
      key: typeof rawKey === "string" && rawKey.trim() ? rawKey.trim() : undefined,
      titleZh: pick("titleZh"),
      titleEn: pick("titleEn"),
    };
  });
}

function getPoseInfoName(v: Pick<PosePromptVariant, "titleZh" | "titleEn">) {
  return v.titleEn.trim() || v.titleZh.trim();
}

function buildColorPromptEn(topicName: string, categoryPath: string, v: PosePromptSpec) {
  return `请生成一张用于儿童打印素材的简洁彩图插画，三级主题为【${topicName}】。分类路径参考：${categoryPath}。

请绘制【${v.titleZh} / ${v.titleEn}】这个姿态或视角的单主体彩图。

风格与画面要求：
1. 只保留一个主体，不要多主体，不要群像。
2. 优先不要依赖背景或场景来制造差异。
3. 整体风格必须首先读起来像"儿童卡通打印插画"。
4. 使用清晰、闭合、利落的黑色外轮廓线。
5. 内部只填充干净、明快、儿童友好的纯色块，默认不要任何阴影效果。不要渐变、不要厚重写实明暗、不要地面投影、不要接触阴影、不要边缘压暗、不要纹理。不要任何形式的投影、光晕、镜面高光、环境光遮蔽或发光效果。
6. 画面必须是简洁彩图，不要做成纯黑白线稿。
7. 主体比例必须是"明确卡通化后的自然简化比例"。
8. 最终输出必须为严格 1:1 正方形画布，背景必须纯白。
9. 主体建议占画面约 55%–75%，视觉居中。
10. 线条数量要少，结构要明确，适合 3–8 岁儿童的涂色、描红、剪贴等打印场景。

输出目标：请围绕【${v.titleZh}】这个姿态或视角生成一张儿童卡通彩图主体图。整体应低复杂度、易识别、轮廓清晰、纯色块明确、强儿童卡通感，适合儿童打印资源使用。`;
}

function buildOutlinePromptZh(topicName: string, categoryPath: string, v: PosePromptSpec) {
  return `请生成一张用于儿童打印素材的黑白线框原始图，三级主题为【${topicName}】。分类路径参考：${categoryPath}。
请绘制【${v.titleZh} / ${v.titleEn}】这个姿态或视角的单主体线框图。

线框图要求：
1. 只保留一个主体，不要多主体。
2. 直接输出可打印的黑白线稿版本。
3. 只使用清晰、闭合、顺滑、黑色的外轮廓线和少量必要结构线；不要任何颜色填充，不要灰度，不要渐变，不要阴影，不要高光，不要纹理，不要噪点。
4. 主体比例必须保持自然简化。
5. 内部线条数量要严格控制。
6. 严格 1:1 正方形画布，背景纯白，主体视觉居中。
7. 整体必须适合儿童涂色、描红和打印使用。`;
}

function buildOutlinePromptEn(topicName: string, categoryPath: string, v: PosePromptSpec) {
  return `请生成一张用于儿童打印素材的黑白线框原始图，三级主题为【${topicName}】。分类路径参考：${categoryPath}。
请绘制【${v.titleZh} / ${v.titleEn}】这个姿态或视角的单主体线框图。

线框图要求：
1. 只保留一个主体，不要多主体。
2. 直接输出可打印的黑白线稿版本。
3. 只使用清晰、闭合、顺滑、黑色的外轮廓线和少量必要结构线；不要任何颜色填充，不要灰度，不要渐变，不要阴影，不要高光，不要纹理，不要噪点。
4. 主体比例必须保持自然简化。
5. 内部线条数量要严格控制。
6. 严格 1:1 正方形画布，背景纯白，主体视觉居中。
7. 整体必须适合儿童涂色、描红和打印使用。`;
}

function buildSceneColorPromptZh(topicName: string, categoryPath: string, v: PosePromptSpec) {
  return `请生成一张用于儿童打印素材的"带完整背景的彩图原始图"，三级主题为【${topicName}】。分类路径参考：${categoryPath}。
请绘制【${v.titleZh} / ${v.titleEn}】这个姿态或视角的完整场景彩图。

带背景彩图要求：
1. 这是完整场景彩图，不是纯白背景主体图。
2. 严格 1:1 正方形画布，背景需要自然铺满整个画布。
3. 主体仍然是第一视觉中心，清晰、易识别。
4. 背景应与主题和姿态合理匹配，使用简化环境元素。
5. 使用清晰黑色外轮廓线；主体与背景内部都以干净明快的纯色块为主，不要渐变、不要厚重阴影、不要高光反射、不要纹理、不要噪点、不要复杂光影。
6. 主体建议占画面约 35%–55%，背景承担其余画面信息。
7. 整体视觉目标应接近"完整儿童场景彩图"。`;
}

function buildSceneColorPromptEn(topicName: string, categoryPath: string, v: PosePromptSpec) {
  return `请生成一张用于儿童打印素材的"带完整背景的彩图原始图"，三级主题为【${topicName}】。分类路径参考：${categoryPath}。
请绘制【${v.titleZh} / ${v.titleEn}】这个姿态或视角的完整场景彩图。

带背景彩图要求：
1. 这是完整场景彩图，不是纯白背景主体图。
2. 严格 1:1 正方形画布，背景需要自然铺满整个画布。
3. 主体仍然是第一视觉中心，清晰、易识别。
4. 背景应与主题和姿态合理匹配，使用简化环境元素。
5. 使用清晰黑色外轮廓线；主体与背景内部都以干净明快的纯色块为主，不要渐变、不要厚重阴影、不要高光反射、不要纹理、不要噪点、不要复杂光影。
6. 主体建议占画面约 35%–55%，背景承担其余画面信息。
7. 整体视觉目标应接近"完整儿童场景彩图"。`;
}

/**
 * Build prompt plans from a category's pose_prompt_specs JSON string.
 * Returns ImgSourcePromptPlanInput[] ready for syncCategoryPosePromptImgSources.
 */
export function buildPromptPlansFromCategory(
  categoryName: string,
  ancestors: string[],
  posePromptSpecsJson: string,
): ImgSourcePromptPlanInput[] {
  const topicName = categoryName.trim();
  const categoryPath = ancestors.length > 0 ? `${ancestors.join(" > ")} > ${topicName}` : topicName;
  const specs = parsePoseSpecs(posePromptSpecsJson);

  return specs.flatMap((spec, index) => {
    const key = spec.key?.trim() || `pose-${index + 1}`;
    const poseInfoName = getPoseInfoName({ titleZh: spec.titleZh, titleEn: spec.titleEn });
    const recordName = `${topicName} - ${poseInfoName}`;
    const baseSort = index * 30;

    return [
      {
        category_id: 0, // will be overridden by syncCategoryPosePromptImgSources
        source_kind: "color" as const,
        prompt_key: `${key}:color`,
        prompt_group: poseInfoName,
        title: `${recordName} - Color Source`,
        description: null,
        prompt_text_zh: buildCopyPosePrompt(spec.titleZh),
        prompt_text_en: buildColorPromptEn(topicName, categoryPath, spec),
        sort_order: baseSort,
        is_active: true,
      },
      {
        category_id: 0,
        source_kind: "outline" as const,
        prompt_key: `${key}:outline`,
        prompt_group: poseInfoName,
        title: `${recordName} - Outline Source`,
        description: null,
        prompt_text_zh: buildOutlinePromptZh(topicName, categoryPath, spec),
        prompt_text_en: buildOutlinePromptEn(topicName, categoryPath, spec),
        sort_order: baseSort + 1,
        is_active: true,
      },
      {
        category_id: 0,
        source_kind: "scene_color" as const,
        prompt_key: `${key}:scene_color`,
        prompt_group: poseInfoName,
        title: `${recordName} - Scene Color Source`,
        description: null,
        prompt_text_zh: buildSceneColorPromptZh(topicName, categoryPath, spec),
        prompt_text_en: buildSceneColorPromptEn(topicName, categoryPath, spec),
        sort_order: baseSort + 2,
        is_active: true,
      },
    ];
  });
}
