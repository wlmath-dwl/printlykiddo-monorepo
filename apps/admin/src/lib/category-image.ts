export const CATEGORY_IMAGE_EXTENSION = ".webp";
export const CATEGORY_IMAGE_SIZE_DEFAULT = 256;
export const CATEGORY_IMAGE_SIZES = [256, 512, 1024] as const;

export type CategoryImageSize = (typeof CATEGORY_IMAGE_SIZES)[number];

export const CATEGORY_IMAGE_TYPES = [
  "outline_original",
  "color_original",
  "coloring",
  "tracing",
  "cut_line",
  "cut_color",
  "puzzle_line",
  "puzzle_color",
  "strip_puzzle_line",
  "strip_puzzle_color",
] as const;

export type CategoryImageType = (typeof CATEGORY_IMAGE_TYPES)[number];

export function isCategoryImageType(value: unknown): value is CategoryImageType {
  return typeof value === "string" && CATEGORY_IMAGE_TYPES.includes(value as CategoryImageType);
}

export function appendCategoryImageSizeSuffix(path: string, size: CategoryImageSize) {
  if (size === CATEGORY_IMAGE_SIZE_DEFAULT) {
    return path;
  }

  return path.replace(new RegExp(`${CATEGORY_IMAGE_EXTENSION}$`, "i"), `-${size}${CATEGORY_IMAGE_EXTENSION}`);
}

export function buildPendingCategoryImagePath(id: string, size: CategoryImageSize = CATEGORY_IMAGE_SIZE_DEFAULT) {
  return appendCategoryImageSizeSuffix(`uploads/pending/${id}${CATEGORY_IMAGE_EXTENSION}`, size);
}

function normalizePathSegment(value: string, fallback: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\\/]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[<>:"|?*]+/g, "")
    .replace(/[^a-z0-9\-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || fallback;
}

export function buildLegacyRemoteCategoryImageKey(id: string) {
  return `imgs/${id}${CATEGORY_IMAGE_EXTENSION}`;
}

export function buildCategoryContentImageKey(options: {
  id: string;
  firstCategorySlug: string;
  secondCategorySlug?: string | null;
  thirdCategorySlug?: string | null;
}) {
  return [
    "imgs",
    normalizePathSegment(options.firstCategorySlug, "category-1"),
    options.secondCategorySlug
      ? normalizePathSegment(options.secondCategorySlug, "category-2")
      : null,
    options.thirdCategorySlug
      ? normalizePathSegment(options.thirdCategorySlug, "category-3")
      : null,
    `${options.id}${CATEGORY_IMAGE_EXTENSION}`,
  ]
    .filter(Boolean)
    .join("/");
}

export function buildCategoryCoverImageKey(options: {
  id: string;
  firstCategorySlug: string;
  secondCategorySlug?: string | null;
}) {
  return [
    "imgs",
    normalizePathSegment(options.firstCategorySlug, "category-1"),
    options.secondCategorySlug
      ? normalizePathSegment(options.secondCategorySlug, "category-2")
      : null,
    `${options.id}${CATEGORY_IMAGE_EXTENSION}`,
  ]
    .filter(Boolean)
    .join("/");
}

export function buildRemoteCategoryImageKey(id: string) {
  return buildLegacyRemoteCategoryImageKey(id);
}

export function getCategoryImageFileName(id: string) {
  return `${id}${CATEGORY_IMAGE_EXTENSION}`;
}
