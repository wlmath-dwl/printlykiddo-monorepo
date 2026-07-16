import "server-only";

import path from "node:path";

import { DatabaseSync } from "node:sqlite";

const DEFAULT_LOCAL_SQLITE_PATH = "../admin/data/local-admin.sqlite";
const DEFAULT_LOCAL_ADMIN_DATA_PATH = "../admin/data";
const CATEGORY_IMAGE_EXTENSION = ".webp";

type CategoryPathRow = {
  id: number;
  parent_id: number | null;
  slug: string;
  cover_image: string | null;
};

function normalizeRelativePath(relativePath: string) {
  return relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
}

export function getLocalAdminDataDir() {
  return path.resolve(
    process.cwd(),
    process.env.LOCAL_ADMIN_DATA_PATH?.trim() || DEFAULT_LOCAL_ADMIN_DATA_PATH,
  );
}

export function getLocalSqlitePath() {
  return path.resolve(
    process.cwd(),
    process.env.LOCAL_SQLITE_PATH?.trim() || DEFAULT_LOCAL_SQLITE_PATH,
  );
}

export function resolveLocalAdminManagedFilePath(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath);
  const dataDir = getLocalAdminDataDir();
  const absolutePath = path.join(dataDir, normalized);
  const relativeFromDataDir = path.relative(dataDir, absolutePath);

  if (
    relativeFromDataDir.startsWith("..") ||
    path.isAbsolute(relativeFromDataDir)
  ) {
    throw new Error("本地文件路径无效。");
  }

  return absolutePath;
}

function normalizeCategoryImageId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildPendingCategoryImagePath(id: string) {
  return `uploads/pending/${id}${CATEGORY_IMAGE_EXTENSION}`;
}

function buildLegacyRemoteCategoryImageKey(id: string) {
  return `imgs/${id}${CATEGORY_IMAGE_EXTENSION}`;
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

function buildCategoryContentImageKey(options: {
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

function buildCategoryCoverImageKey(options: {
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

function getCategoryPathRows(
  categoryId: number,
  rowsById: Map<number, Pick<CategoryPathRow, "id" | "parent_id" | "slug">>,
) {
  const pathRows: Array<Pick<CategoryPathRow, "id" | "parent_id" | "slug">> =
    [];
  let currentId: number | null = categoryId;

  while (currentId !== null) {
    const row = rowsById.get(currentId);
    if (!row) {
      break;
    }
    pathRows.unshift(row);
    currentId = row.parent_id;
  }

  return pathRows;
}

function buildCategoryImageObjectKeyForCategory(options: {
  categoryId: number;
  imageId: string;
  isCoverImage: boolean;
  rowsById: Map<number, Pick<CategoryPathRow, "id" | "parent_id" | "slug">>;
}) {
  const pathRows = getCategoryPathRows(options.categoryId, options.rowsById);

  if (pathRows.length === 0) {
    return buildLegacyRemoteCategoryImageKey(options.imageId);
  }

  const firstCategory = pathRows[0];
  const secondCategory = pathRows[1] ?? null;
  const thirdCategory = pathRows[2] ?? null;

  if (options.isCoverImage && pathRows.length <= 2) {
    return buildCategoryCoverImageKey({
      id: options.imageId,
      firstCategorySlug: firstCategory.slug,
      secondCategorySlug: secondCategory?.slug ?? null,
    });
  }

  return buildCategoryContentImageKey({
    id: options.imageId,
    firstCategorySlug: firstCategory.slug,
    secondCategorySlug: secondCategory?.slug ?? null,
    thirdCategorySlug: thirdCategory?.slug ?? null,
  });
}

export function resolveCategoryImageObjectKeyFromLocalDb(imageId: string) {
  const db = new DatabaseSync(getLocalSqlitePath(), { readOnly: true });

  try {
    const rows = db
      .prepare(
        `SELECT id, parent_id, slug, cover_image
         FROM categories
         WHERE cover_image IS NOT NULL`,
      )
      .all() as CategoryPathRow[];
    const rowsById = new Map(rows.map((row) => [row.id, row]));

    for (const row of rows) {
      if (normalizeCategoryImageId(row.cover_image) !== imageId) {
        continue;
      }

      return buildCategoryImageObjectKeyForCategory({
        categoryId: row.id,
        imageId,
        isCoverImage: true,
        rowsById,
      });
    }

    return buildLegacyRemoteCategoryImageKey(imageId);
  } finally {
    db.close();
  }
}

export function buildLocalDevCategoryPendingPath(imageId: string) {
  return buildPendingCategoryImagePath(imageId);
}
