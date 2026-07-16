import { type CategoryImageType, isCategoryImageType } from "@/lib/category-image";

export const CATEGORY_IMAGE_GROUPS = [
  "origin",
  "origin_color",
  "coloring",
  "tracing",
  "cut",
  "cut_color",
  "puzzle",
  "puzzle_color",
  "strip_puzzle",
  "strip_puzzle_color",
] as const;

export const CATEGORY_GENERATED_IMAGE_GROUPS = [
  "coloring",
  "tracing",
  "cut",
  "cut_color",
  "puzzle",
  "puzzle_color",
  "strip_puzzle",
  "strip_puzzle_color",
] as const;

export type CategoryImageGroup = (typeof CATEGORY_IMAGE_GROUPS)[number];
export type CategoryGeneratedImageGroup = (typeof CATEGORY_GENERATED_IMAGE_GROUPS)[number];
export type CategoryImageSlot = "source" | "cover" | "card" | "pdf";

export type CategoryGeneratedImageSet = {
  cover?: string | null;
  card?: string[];
  pdf?: string[];
};

export type CategoryImageList = {
  origin?: string[];
  origin_color?: string[];
  coloring?: CategoryGeneratedImageSet;
  tracing?: CategoryGeneratedImageSet;
  cut?: CategoryGeneratedImageSet;
  cut_color?: CategoryGeneratedImageSet;
  puzzle?: CategoryGeneratedImageSet;
  puzzle_color?: CategoryGeneratedImageSet;
  strip_puzzle?: CategoryGeneratedImageSet;
  strip_puzzle_color?: CategoryGeneratedImageSet;
};

export type CategoryImageItem = {
  id: string;
  group: CategoryImageGroup;
  slot: CategoryImageSlot;
};

function normalizeCategoryImageId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function toCategoryImageItem(id: unknown, group: CategoryImageGroup, slot: CategoryImageSlot) {
  const normalizedId = normalizeCategoryImageId(id);
  return normalizedId ? { id: normalizedId, group, slot } : null;
}

function isLegacyCategoryImageItem(value: unknown): value is { id: string; type: CategoryImageType } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && isCategoryImageType(record.type);
}

function normalizeCategoryImageIdArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeCategoryImageId(item))
    .filter((item): item is string => item !== null);
}

function normalizeGeneratedImageSet(value: unknown): CategoryGeneratedImageSet {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    cover: normalizeCategoryImageId(record.cover),
    card: normalizeCategoryImageIdArray(record.card),
    pdf: normalizeCategoryImageIdArray(record.pdf),
  };
}

function buildLegacyGeneratedImageSet(id: unknown): CategoryGeneratedImageSet {
  const normalizedId = normalizeCategoryImageId(id);

  return {
    cover: normalizedId,
    card: normalizedId ? [normalizedId] : [],
    pdf: normalizedId ? [normalizedId] : [],
  };
}

function normalizeLegacyCategoryImageList(value: unknown) {
  if (!Array.isArray(value)) {
    return null;
  }

  const legacyItems = value.filter(isLegacyCategoryImageItem);

  const findId = (type: CategoryImageType) =>
    legacyItems.find((item) => item.type === type)?.id ?? null;

  return normalizeCategoryImageListValue({
    origin: normalizeCategoryImageIdArray([findId("outline_original")]),
    origin_color: normalizeCategoryImageIdArray([findId("color_original")]),
    coloring: buildLegacyGeneratedImageSet(findId("coloring")),
    tracing: buildLegacyGeneratedImageSet(findId("tracing")),
    cut: buildLegacyGeneratedImageSet(findId("cut_line")),
    cut_color: buildLegacyGeneratedImageSet(findId("cut_color")),
    puzzle: buildLegacyGeneratedImageSet(findId("puzzle_line")),
    puzzle_color: buildLegacyGeneratedImageSet(findId("puzzle_color")),
    strip_puzzle: buildLegacyGeneratedImageSet(findId("strip_puzzle_line")),
    strip_puzzle_color: buildLegacyGeneratedImageSet(findId("strip_puzzle_color")),
  });
}

function normalizeCategoryImageListValue(value: unknown): CategoryImageList {
  const legacyNormalized = normalizeLegacyCategoryImageList(value);
  if (legacyNormalized) {
    return legacyNormalized;
  }

  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const legacyOriginal = (record.original as Record<string, unknown> | undefined) ?? {};
  const legacyPractice = (record.practice as Record<string, unknown> | undefined) ?? {};
  const legacyCut = (record.cut as Record<string, unknown> | undefined) ?? {};
  const legacyPuzzle = (record.puzzle as Record<string, unknown> | undefined) ?? {};
  const legacyStripPuzzle = (record.strip_puzzle as Record<string, unknown> | undefined) ?? {};
  const rawCutColor = record.cut_color as Record<string, unknown> | undefined;
  const rawPuzzleColor = record.puzzle_color as Record<string, unknown> | undefined;
  const rawStripPuzzleColor = record.strip_puzzle_color as Record<string, unknown> | undefined;
  const originValue = record.origin ?? record.orgin;

  return {
    origin: normalizeCategoryImageIdArray(originValue ?? [legacyOriginal.outline]),
    origin_color: normalizeCategoryImageIdArray(record.origin_color ?? [legacyOriginal.color]),
    coloring: record.coloring
      ? normalizeGeneratedImageSet(record.coloring)
      : buildLegacyGeneratedImageSet(legacyPractice.coloring),
    tracing: record.tracing
      ? normalizeGeneratedImageSet(record.tracing)
      : buildLegacyGeneratedImageSet(legacyPractice.tracing),
    cut: Array.isArray(legacyCut.card) || Array.isArray(legacyCut.pdf)
      ? normalizeGeneratedImageSet(record.cut)
      : buildLegacyGeneratedImageSet(legacyCut.cover),
    cut_color: rawCutColor
      ? normalizeGeneratedImageSet(record.cut_color)
      : buildLegacyGeneratedImageSet(legacyCut.card),
    puzzle: Array.isArray(legacyPuzzle.card) || Array.isArray(legacyPuzzle.pdf)
      ? normalizeGeneratedImageSet(record.puzzle)
      : buildLegacyGeneratedImageSet(legacyPuzzle.cover),
    puzzle_color: rawPuzzleColor
      ? normalizeGeneratedImageSet(record.puzzle_color)
      : buildLegacyGeneratedImageSet(legacyPuzzle.card),
    strip_puzzle: Array.isArray(legacyStripPuzzle.card) || Array.isArray(legacyStripPuzzle.pdf)
      ? normalizeGeneratedImageSet(record.strip_puzzle)
      : buildLegacyGeneratedImageSet(legacyStripPuzzle.cover),
    strip_puzzle_color: rawStripPuzzleColor
      ? normalizeGeneratedImageSet(record.strip_puzzle_color)
      : buildLegacyGeneratedImageSet(legacyStripPuzzle.card),
  };
}

export function parseCategoryImageList(value: unknown): CategoryImageList {
  if (typeof value !== "string" || !value.trim()) {
    return normalizeCategoryImageListValue({});
  }

  try {
    return normalizeCategoryImageListValue(JSON.parse(value) as unknown);
  } catch {
    return normalizeCategoryImageListValue({});
  }
}

export function normalizeCategoryImageList(input?: CategoryImageList | null): CategoryImageList {
  return normalizeCategoryImageListValue(input ?? {});
}

export function listCategoryImageItems(imageList?: CategoryImageList | null): CategoryImageItem[] {
  const normalized = normalizeCategoryImageList(imageList);
  const generatedItems = CATEGORY_GENERATED_IMAGE_GROUPS.flatMap((group) => {
    const set = normalized[group] ?? {};

    return [
      toCategoryImageItem(set.cover, group, "cover"),
      ...((set.card ?? []).map((id) => toCategoryImageItem(id, group, "card"))),
      ...((set.pdf ?? []).map((id) => toCategoryImageItem(id, group, "pdf"))),
    ];
  });

  return [
    ...((normalized.origin ?? []).map((id) => toCategoryImageItem(id, "origin", "source"))),
    ...((normalized.origin_color ?? []).map((id) =>
      toCategoryImageItem(id, "origin_color", "source"),
    )),
    ...generatedItems,
  ].filter((item): item is CategoryImageItem => item !== null);
}

export function collectCategoryImageIds(value: unknown): string[] {
  const directId = normalizeCategoryImageId(value);
  if (directId && !directId.startsWith("{") && !directId.startsWith("[")) {
    return [directId];
  }

  return [
    ...new Set(listCategoryImageItems(parseCategoryImageList(value)).map((item) => item.id)),
  ];
}

export function stringifyCategoryImageList(imageList?: CategoryImageList | null) {
  return JSON.stringify(normalizeCategoryImageList(imageList));
}
