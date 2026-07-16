import path from "node:path";
import slugify from "slugify";

import {
  clearCategoryGeneratedImgs,
  createImg,
  deleteImgsBatch,
  getCategoryById,
  getCategorySlugPathSegments,
  getImgSourceById,
  listActives,
  listImgs,
  listImgSourcesByCategory,
  setImgSourceGeneratedImgIds,
} from "@/lib/admin-db";
import type { ImgSourceListItem } from "@/lib/admin-types";
import {
  buildGeneratedImgBuffer,
  getAvailableGeneratedVariants,
  getDefaultGeneratedVariants,
  IMG_GENERATED_VARIANT_META,
  type ImgGeneratedVariant,
  type ImgSourceKind,
} from "@/lib/img-source-generation";
import { buildImgObjectKeys } from "@/lib/img-storage";
import { readManagedFile, saveManagedImageBufferAtPath } from "@/lib/local-image-storage";

type GenerateTarget = {
  variant: ImgGeneratedVariant;
  meta: (typeof IMG_GENERATED_VARIANT_META)[ImgGeneratedVariant];
  active: Awaited<ReturnType<typeof listActives>>["items"][number];
};

type GenerateTask = {
  source: ImgSourceListItem;
  targets: GenerateTarget[];
};

type GenerateResult = {
  items: Array<Awaited<ReturnType<typeof createImg>>>;
  generated_count: number;
  drafted_count?: number;
  deleted_count: number;
  skipped_existing?: boolean;
};

const IMG_SOURCE_KIND_META: Record<
  ImgSourceListItem["source_kind"],
  {
    titleName: string;
    slugName: string;
  }
> = {
  outline: {
    titleName: "Outline Source",
    slugName: "outline-source",
  },
  color: {
    titleName: "Color Source",
    slugName: "color-source",
  },
  scene_color: {
    titleName: "Scene Color Source",
    slugName: "scene-color-source",
  },
};

function normalizeSlugPart(value: string) {
  return (
    slugify(value, {
      lower: true,
      strict: true,
      trim: true,
    }) || "item"
  );
}

function isManualUploadVariant(variant: ImgGeneratedVariant) {
  void variant;
  return false;
}

function extractPoseInfoName(source: ImgSourceListItem, categoryName: string) {
  const promptGroup = source.prompt_group?.trim();
  if (promptGroup) {
    if (promptGroup.includes(" / ")) {
      const englishPart = promptGroup
        .split("/")
        .map((part) => part.trim())
        .find((part) => /[A-Za-z]/.test(part));
      if (englishPart) {
        return englishPart;
      }
    }

    const categoryPrefix = `${categoryName} - `;
    if (promptGroup.startsWith(categoryPrefix)) {
      return promptGroup.slice(categoryPrefix.length).trim() || categoryName;
    }

    return promptGroup;
  }

  const sourceTitle = source.title?.trim() || "";
  if (sourceTitle) {
    const categoryPrefix = `${categoryName} - `;
    let normalizedTitle = sourceTitle.startsWith(categoryPrefix)
      ? sourceTitle.slice(categoryPrefix.length).trim()
      : sourceTitle;

    Object.values(IMG_SOURCE_KIND_META).forEach((meta) => {
      const suffix = ` - ${meta.titleName}`;
      if (normalizedTitle.endsWith(suffix)) {
        normalizedTitle = normalizedTitle.slice(0, -suffix.length).trim();
      }
    });

    return normalizedTitle || categoryName;
  }

  return categoryName;
}

function resolveTargets(
  actives: Awaited<ReturnType<typeof listActives>>["items"],
  sourceKind: ImgSourceKind,
  variants?: ImgGeneratedVariant[],
) {
  const allowedVariants = getAvailableGeneratedVariants(sourceKind);
  const requestedVariants = Array.isArray(variants)
    ? variants.filter((item): item is ImgGeneratedVariant => allowedVariants.includes(item))
    : getDefaultGeneratedVariants(sourceKind);
  const activeMap = new Map(actives.map((item) => [item.slug, item]));
  return requestedVariants.map((variant) => {
    const meta = IMG_GENERATED_VARIANT_META[variant];
    const active = activeMap.get(meta.activeSlug);

    if (!active) {
      throw new Error(`缺少功能：${meta.label}（${meta.activeSlug}）。`);
    }

    return { variant, meta, active };
  });
}

async function deleteExistingImgsBySource(source: ImgSourceListItem, activeIds: number[]) {
  if (activeIds.length === 0) {
    return { deleted_count: 0, deleted_ids: [] as number[] };
  }

  const activeIdSet = new Set(activeIds);
  const generatedIdSet = new Set(source.generated_img_ids);
  const existingImgs = await listImgs({ category_id: source.category_id });
  const ids = existingImgs.items
    .filter((item) => generatedIdSet.has(item.id) && activeIdSet.has(item.active_id))
    .map((item) => item.id);

  if (ids.length === 0) {
    return { deleted_count: 0, deleted_ids: [] as number[] };
  }

  const result = await deleteImgsBatch(ids);
  return { deleted_count: result.deleted, deleted_ids: ids };
}

async function createImgsFromTasks(categoryId: number, tasks: GenerateTask[]) {
  const [category, categorySlugPath, currentImgs] = await Promise.all([
    getCategoryById(categoryId),
    getCategorySlugPathSegments(categoryId),
    listImgs({ category_id: categoryId }),
  ]);

  if (!category) {
    throw new Error("原始图所属分类不存在。");
  }

  let nextSortOrder =
    currentImgs.items.reduce((max, item) => Math.max(max, item.sort_order), 0) + 10;
  const createdItems: Array<Awaited<ReturnType<typeof createImg>>> = [];
  const createdIdsBySourceId = new Map<number, number[]>();
  let draftedCount = 0;

  for (const task of tasks) {
    if (!task.source.local_file_path?.trim() || !task.source.image_url?.trim()) {
      throw new Error(`原始图 ${task.source.title || task.source.id} 还没有上传图片文件。`);
    }

    const needsLocalGeneration = task.targets.some((target) => !isManualUploadVariant(target.variant));
    const sourceBuffer = needsLocalGeneration
      ? await readManagedFile(task.source.local_file_path)
      : null;

    for (const target of task.targets) {
      const poseInfoName = extractPoseInfoName(task.source, category.name);
      const sourceKindMeta = IMG_SOURCE_KIND_META[task.source.source_kind];
      const activeName = target.active.name.trim() || target.meta.label;
      const title = `${category.name} - ${poseInfoName} - ${sourceKindMeta.titleName} - ${activeName}`;
      const slug = [
        normalizeSlugPart(category.name),
        normalizeSlugPart(poseInfoName),
        sourceKindMeta.slugName,
        normalizeSlugPart(target.active.slug),
      ].join("-");
      const objectKeys = buildImgObjectKeys({
        categorySlugPath,
        activeSlug: target.active.slug,
        fileName: path.basename(task.source.image_url),
      });
      const created = isManualUploadVariant(target.variant)
        ? await createImg({
            category_id: category.id,
            active_id: target.active.id,
            image_url: objectKeys.image_url,
            image_url_card: objectKeys.image_url_card,
            title,
            slug,
            description: null,
            sort_order: nextSortOrder,
            is_active: true,
            manual_upload_pending: true,
          })
        : await (async () => {
            if (!sourceBuffer) {
              throw new Error("原始图文件不存在，无法直接生成功能图。");
            }

            const [mainBuffer, cardBuffer] = await buildGeneratedBuffers({
              sourceBuffer,
              sourceKind: task.source.source_kind,
              variant: target.variant,
            });
            const [mainFile, cardFile] = await Promise.all([
              saveManagedImageBufferAtPath(mainBuffer, objectKeys.image_url, { normalize: false }),
              saveManagedImageBufferAtPath(cardBuffer, objectKeys.image_url_card, { normalize: false }),
            ]);

            return createImg({
              category_id: category.id,
              active_id: target.active.id,
              image_url: objectKeys.image_url,
              image_url_card: objectKeys.image_url_card,
              local_file_path: mainFile.local_file_path,
              local_file_path_card: cardFile.local_file_path,
              title,
              slug,
              description: null,
              sort_order: nextSortOrder,
              is_active: true,
            });
          })();

      if (!created) {
        throw new Error("生成功能图后读取记录失败。");
      }

      if (isManualUploadVariant(target.variant)) {
        draftedCount += 1;
      }
      nextSortOrder += 10;
      createdItems.push(created);
      const currentIds = createdIdsBySourceId.get(task.source.id) ?? [];
      currentIds.push(created.id);
      createdIdsBySourceId.set(task.source.id, currentIds);
    }
  }

  return {
    items: createdItems,
    created_ids_by_source_id: createdIdsBySourceId,
    drafted_count: draftedCount,
  };
}

async function buildGeneratedBuffers(options: {
  sourceBuffer: Buffer;
  sourceKind: ImgSourceKind;
  variant: ImgGeneratedVariant;
}) {
  return Promise.all([
    buildGeneratedImgBuffer({
      sourceBuffer: options.sourceBuffer,
      sourceKind: options.sourceKind,
      variant: options.variant,
      size: 1280,
    }),
    buildGeneratedImgBuffer({
      sourceBuffer: options.sourceBuffer,
      sourceKind: options.sourceKind,
      variant: options.variant,
      size: 512,
    }),
  ]);
}

async function resolveMissingTargets(source: ImgSourceListItem, targets: GenerateTarget[]) {
  if (targets.length === 0) {
    return [];
  }

  const existingImgs = await listImgs({ category_id: source.category_id });
  const generatedIdSet = new Set(source.generated_img_ids);
  const existingActiveIds = new Set(
    existingImgs.items
      .filter((item) => generatedIdSet.has(item.id))
      .map((item) => item.active_id),
  );

  return targets.filter((target) => !existingActiveIds.has(target.active.id));
}

export async function generateImgsFromSource(options: {
  sourceId: number;
  sourceKind?: ImgSourceKind;
  variants?: ImgGeneratedVariant[];
  replaceExisting?: boolean;
}): Promise<GenerateResult> {
  const [source, actives] = await Promise.all([getImgSourceById(options.sourceId), listActives()]);

  if (!source) {
    throw new Error("原始图不存在。");
  }

  const sourceKind = options.sourceKind ?? source.source_kind;
  const targets = resolveTargets(actives.items, sourceKind, options.variants);
  if (targets.length === 0) {
    return {
      items: [],
      generated_count: 0,
      deleted_count: 0,
    };
  }
  const previousGeneratedIds = source.generated_img_ids;
  const deleteResult = options.replaceExisting === false
    ? { deleted_count: 0, deleted_ids: [] as number[] }
    : await deleteExistingImgsBySource(
        source,
        [...new Set(targets.map((item) => item.active.id))],
      );
  const { items, created_ids_by_source_id, drafted_count } = await createImgsFromTasks(source.category_id, [
    { source, targets },
  ]);
  const createdIds = created_ids_by_source_id.get(source.id) ?? [];
  const retainedGeneratedIds = previousGeneratedIds.filter((id) => !deleteResult.deleted_ids.includes(id));
  const nextGeneratedIds = [...new Set([...retainedGeneratedIds, ...createdIds])];
  await setImgSourceGeneratedImgIds(source.id, nextGeneratedIds);

  return {
    items,
    generated_count: items.length,
    drafted_count,
    deleted_count: deleteResult.deleted_count,
  };
}

export async function generateMissingImgsFromSource(options: {
  sourceId: number;
  sourceKind?: ImgSourceKind;
  variants?: ImgGeneratedVariant[];
}): Promise<GenerateResult> {
  const [source, actives] = await Promise.all([getImgSourceById(options.sourceId), listActives()]);

  if (!source) {
    throw new Error("原始图不存在。");
  }

  const sourceKind = options.sourceKind ?? source.source_kind;
  const targets = resolveTargets(actives.items, sourceKind, options.variants);
  if (targets.length === 0) {
    return {
      items: [],
      generated_count: 0,
      deleted_count: 0,
      skipped_existing: true,
    };
  }
  const missingTargets = await resolveMissingTargets(source, targets);

  if (missingTargets.length === 0) {
    return {
      items: [],
      generated_count: 0,
      deleted_count: 0,
      skipped_existing: true,
    };
  }

  const { items, created_ids_by_source_id, drafted_count } = await createImgsFromTasks(source.category_id, [
    { source, targets: missingTargets },
  ]);
  const createdIds = created_ids_by_source_id.get(source.id) ?? [];
  await setImgSourceGeneratedImgIds(source.id, [...new Set([...source.generated_img_ids, ...createdIds])]);

  return {
    items,
    generated_count: items.length,
    drafted_count,
    deleted_count: 0,
    skipped_existing: false,
  };
}

export async function generateImgsFromCategorySources(options: {
  categoryId: number;
  replaceExisting?: boolean;
}): Promise<GenerateResult> {
  const [sources, actives] = await Promise.all([
    listImgSourcesByCategory(options.categoryId),
    listActives(),
  ]);

  if (sources.items.length === 0) {
    throw new Error("当前分类下还没有可用于生成的原始图。");
  }

  const tasks = sources.items
    .slice()
    .sort((left, right) => left.id - right.id)
    .map((source) => ({
      source,
      targets: resolveTargets(actives.items, source.source_kind),
    }))
    .filter((task) => task.targets.length > 0);
  if (tasks.length === 0) {
    return {
      items: [],
      generated_count: 0,
      deleted_count: 0,
    };
  }
  const deleteResult = options.replaceExisting === false
    ? { deleted_count: 0, deleted_ids: [] as number[] }
    : (() => clearCategoryGeneratedImgs(options.categoryId).then((result) => ({
        deleted_count: result.deleted_img_count,
        deleted_ids: [] as number[],
      })))();
  const resolvedDeleteResult = await deleteResult;
  if (options.replaceExisting !== false) {
    await Promise.all(
      sources.items.map((source) => setImgSourceGeneratedImgIds(source.id, [])),
    );
  }
  const { items, created_ids_by_source_id, drafted_count } = await createImgsFromTasks(
    options.categoryId,
    tasks,
  );
  await Promise.all(
    tasks.map(({ source }) =>
      setImgSourceGeneratedImgIds(
        source.id,
        options.replaceExisting === false
          ? [...new Set([...source.generated_img_ids, ...(created_ids_by_source_id.get(source.id) ?? [])])]
          : created_ids_by_source_id.get(source.id) ?? [],
      ),
    ),
  );

  return {
    items,
    generated_count: items.length,
    drafted_count,
    deleted_count: resolvedDeleteResult.deleted_count,
  };
}
