import {
  createImgSource,
  getCategorySlugPathSegments,
  getImgSourceById,
  listImgSourcesByCategory,
  updateImgSource,
} from "@/lib/admin-db";
import type { ImgSourceListItem } from "@/lib/admin-types";
import {
  generateTestImageVariantsSettledFromBuffer,
  type GoogleImageVariantKind,
} from "@/lib/google-image-variant-test";
import { saveGeneratedImgSourceBuffer } from "@/lib/img-source-storage";
import { readManagedFile } from "@/lib/local-image-storage";

export type DerivedSourceKind = "outline" | "scene_color";

const SOURCE_KIND_TITLE_SUFFIX: Record<ImgSourceListItem["source_kind"], string> = {
  color: "Color Source",
  outline: "Outline Source",
  scene_color: "Scene Color Source",
};

const DERIVED_SORT_OFFSET: Record<DerivedSourceKind, number> = {
  outline: 1,
  scene_color: 2,
};

function hasUploadedImgSource(
  item: Pick<ImgSourceListItem, "image_url" | "local_file_path"> | null | undefined,
) {
  return Boolean(item?.image_url?.trim() && item?.local_file_path?.trim());
}

function getPromptBaseKey(promptKey?: string | null) {
  const normalized = promptKey?.trim() || "";
  if (!normalized) {
    return "";
  }

  const lastColonIndex = normalized.lastIndexOf(":");
  return lastColonIndex >= 0 ? normalized.slice(0, lastColonIndex) : normalized;
}

function buildDerivedPromptKey(source: ImgSourceListItem, targetKind: DerivedSourceKind) {
  const baseKey = getPromptBaseKey(source.prompt_key);
  return baseKey ? `${baseKey}:${targetKind}` : null;
}

function buildDerivedTitle(source: ImgSourceListItem, targetKind: DerivedSourceKind) {
  const sourceTitle = source.title?.trim() || "";
  const targetSuffix = SOURCE_KIND_TITLE_SUFFIX[targetKind];

  if (!sourceTitle) {
    return targetSuffix;
  }

  for (const suffix of Object.values(SOURCE_KIND_TITLE_SUFFIX)) {
    const suffixWithDash = ` - ${suffix}`;
    if (sourceTitle.endsWith(suffixWithDash)) {
      return `${sourceTitle.slice(0, -suffixWithDash.length)} - ${targetSuffix}`;
    }
  }

  return `${sourceTitle} - ${targetSuffix}`;
}

function getTargetKindLabel(targetKind: DerivedSourceKind) {
  return targetKind === "scene_color" ? "带背景彩图" : "线框图";
}

export function findDerivedTargetRecord(
  items: ImgSourceListItem[],
  source: ImgSourceListItem,
  targetKind: DerivedSourceKind,
) {
  const expectedPromptKey = buildDerivedPromptKey(source, targetKind);
  if (expectedPromptKey) {
    const matched = items.find((item) => item.prompt_key === expectedPromptKey);
    if (matched) {
      return matched;
    }
  }

  const expectedTitle = buildDerivedTitle(source, targetKind);
  const matchedByTitle = items.find(
    (item) => item.source_kind === targetKind && (item.title?.trim() || "") === expectedTitle,
  );
  if (matchedByTitle) {
    return matchedByTitle;
  }

  const promptGroup = source.prompt_group?.trim() || "";
  if (promptGroup) {
    const matchedByPromptGroup = items.find(
      (item) => item.source_kind === targetKind && (item.prompt_group?.trim() || "") === promptGroup,
    );
    if (matchedByPromptGroup) {
      return matchedByPromptGroup;
    }
  }

  return null;
}

async function upsertDerivedSource(options: {
  source: ImgSourceListItem;
  existingTarget: ImgSourceListItem | null;
  targetKind: DerivedSourceKind;
  savedFile: {
    image_url: string;
    local_file_path: string;
  };
}) {
  const commonPayload = {
    source_kind: options.targetKind,
    image_url: options.savedFile.image_url,
    local_file_path: options.savedFile.local_file_path,
    title: buildDerivedTitle(options.source, options.targetKind),
    description: options.existingTarget?.description ?? options.source.description ?? null,
    prompt_key:
      options.existingTarget?.prompt_key ?? buildDerivedPromptKey(options.source, options.targetKind),
    prompt_group: options.existingTarget?.prompt_group ?? options.source.prompt_group ?? null,
    prompt_text_zh: options.existingTarget?.prompt_text_zh ?? null,
    prompt_text_en: options.existingTarget?.prompt_text_en ?? null,
    sort_order:
      options.existingTarget?.sort_order ??
      options.source.sort_order + DERIVED_SORT_OFFSET[options.targetKind],
    is_active: options.existingTarget?.is_active ?? options.source.is_active,
  };

  if (options.existingTarget) {
    return updateImgSource(options.existingTarget.id, commonPayload);
  }

  return createImgSource({
    category_id: options.source.category_id,
    ...commonPayload,
  });
}

export async function generateDerivedSourcesForColorSource(options: {
  sourceId: number;
  targetKinds?: DerivedSourceKind[];
  skipExistingUploadedTargets?: boolean;
  onProgress?: (message: string) => void;
}) {
  options.onProgress?.("正在读取原始图记录…");
  const source = await getImgSourceById(options.sourceId);
  if (!source) {
    throw new Error("原始图不存在。");
  }

  if (source.source_kind !== "color") {
    throw new Error("只有彩图原始图才能派生生成背景图和线框图。");
  }

  if (!hasUploadedImgSource(source)) {
    throw new Error("这条彩图原始图还没有上传图片文件。");
  }

  const requestedTargetKinds = Array.from(
    new Set((options.targetKinds?.length ? options.targetKinds : ["outline", "scene_color"]) as DerivedSourceKind[]),
  );
  options.onProgress?.("正在读取原始图文件和分类上下文…");
  const [sourceBuffer, categorySlugPath, categorySources] = await Promise.all([
    readManagedFile(source.local_file_path!),
    getCategorySlugPathSegments(source.category_id),
    listImgSourcesByCategory(source.category_id),
  ]);

  const targets = requestedTargetKinds
    .map((targetKind) => ({
      targetKind,
      existingTarget: findDerivedTargetRecord(categorySources.items, source, targetKind),
    }))
    .filter((item) => (options.skipExistingUploadedTargets ? !hasUploadedImgSource(item.existingTarget) : true));

  if (targets.length === 0) {
    return {
      source_id: source.id,
      source_title: source.title,
      items: [],
      errors: {} as Partial<Record<DerivedSourceKind, string>>,
      skipped_existing: true,
    };
  }

  options.onProgress?.(
    `准备生成：${targets.map(({ targetKind }) => getTargetKindLabel(targetKind)).join("、")}…`,
  );
  const generation = await generateTestImageVariantsSettledFromBuffer(
    {
      buffer: sourceBuffer,
      mimeType: "image/webp",
    },
    targets.map(({ targetKind }) => targetKind as GoogleImageVariantKind),
    {
      onProgress: ({ message }) => {
        options.onProgress?.(message);
      },
    },
  );

  const successfulTargets = targets.filter(({ targetKind }) => Boolean(generation.results[targetKind]));
  const failedEntries = Object.entries(generation.errors).filter((entry): entry is [DerivedSourceKind, string] =>
    Boolean(entry[1]),
  );

  if (successfulTargets.length === 0 && failedEntries.length > 0) {
    throw new Error(
      failedEntries.map(([targetKind, message]) => `${getTargetKindLabel(targetKind)}：${message}`).join("；"),
    );
  }

  const savedFileMap = new Map<DerivedSourceKind, Awaited<ReturnType<typeof saveGeneratedImgSourceBuffer>>>();
  for (const { targetKind } of successfulTargets) {
    const variant = generation.results[targetKind];
    if (!variant) {
      continue;
    }

    options.onProgress?.(`正在保存${getTargetKindLabel(targetKind)}文件…`);
    const savedFile = await saveGeneratedImgSourceBuffer(
      Buffer.from(variant.base64Data, "base64"),
      categorySlugPath,
    );
    savedFileMap.set(targetKind, savedFile);
  }

  const items = [];
  for (const { targetKind, existingTarget } of successfulTargets) {
    options.onProgress?.(`正在写入${getTargetKindLabel(targetKind)}记录…`);
    const item = await upsertDerivedSource({
      source,
      existingTarget,
      targetKind,
      savedFile: savedFileMap.get(targetKind)!,
    });
    items.push(item);
  }

  return {
    source_id: source.id,
    source_title: source.title,
    items: items.filter(Boolean),
    errors: generation.errors,
    skipped_existing: false,
  };
}
