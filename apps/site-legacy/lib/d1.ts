import { getCloudflareContext } from "@opennextjs/cloudflare";
import { unstable_cache } from "next/cache";
import { cache } from "react";

import {
  buildCategoryImageUrl,
  getCategoryOriginImageUrl,
  parseCategoryImageManifest,
  type CategoryImageManifest,
} from "@/lib/category-functions";
import {
  resolveMaterialImageUrlFromDatabase,
  resolveSiteImageUrl,
} from "@/lib/site-seo";
import {
  buildLocalDevImageUrl,
  isPrintlyKiddoLocalDev,
} from "@/lib/printly-local-dev";
import { normalizeWords, type WordLibraryGroup, type WordSearchTheme } from "@/lib/word-search";
import {
  getStaticPuzzleCategoryPage,
  getStaticPuzzleRootCategory,
  getStaticPuzzlePages,
  isStaticPuzzleCategoryActive,
} from "@/lib/puzzle-static-data";

/**
 * 线上 / Cloudflare 预览走 D1，`next dev` 在本地读取 sqlite。
 * 本地开发默认直接复用 `printly-admin` 的 sqlite，避免前后台各读一份文件。
 */

/** 一级类目缓存 tag。后台改一级类目后调用 `revalidateTag(CATEGORIES_CACHE_TAG)` 立即失效。 */
export const CATEGORIES_CACHE_TAG = "categories";
const CATEGORY_REVALIDATE_SECONDS = 60 * 60 * 24; // 1 天

export type FeaturedCollection = {
  slug: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  heroImageUrl: string | null;
  cardImageUrl: string | null;
  themeColor: string;
  itemCount: number;
};

export type SpecialPageItem = {
  type: "category";
  title: string;
  description: string;
  url: string;
  imageUrl: string | null;
  sortOrder: number;
};

export type SpecialPage = FeaturedCollection & {
  seoTitle: string | null;
  seoDescription: string | null;
  items: SpecialPageItem[];
};

export type FirstCategory = {
  id: number;
  slug: string;
  imagePath: string;
  title: string;
  description: string;
  manualDescription: string | null;
  /** 类目封面图；若 `cover_image` 是 JSON，则可解析为 image manifest */
  coverImageUrl: string | null;
  /** 类目封面 512 展示图，用于页面顶部预览卡 */
  coverImageUrl512: string | null;
  seoImageUrl: string | null;
  imageManifest:
    | import("@/lib/category-functions").CategoryImageManifest
    | null;
};

export type ChildCategory = {
  id: number;
  slug: string;
  imagePath: string;
  title: string;
  description: string;
  manualDescription: string | null;
  coverImageUrl: string | null;
  coverImageUrl512: string | null;
  seoImageUrl: string | null;
  imageManifest:
    | import("@/lib/category-functions").CategoryImageManifest
    | null;
};

/** 首页 hero 区文案与配图（来自 `homepage_config`） */
export type HomepageConfig = {
  title: string;
  description: string;
  /** 最终用于 `<img src>` 的绝对地址（库内会按图床域名解析相对路径） */
  heroImageUrl: string;
  seoTitle: string;
  seoDescription: string;
  footerParagraph: string;
  categoryPrintableCounts: Record<string, number>;
  totalPrintableCount: number;
};

export type CategoryPageData = {
  current: ChildCategory | null;
  parent: FirstCategory | null;
  /** 三级类目页：介于一级与当前之间的二级类目 */
  secondLevel: ChildCategory | null;
  data: ChildCategory[];
  listingMode: "children" | "siblings";
};

export type ActiveSummary = {
  id: number;
  name: string;
  slug: string;
  description: string;
  sortOrder: number;
  coloredLabel: boolean;
};

export type ImgSummary = {
  id: number;
  categoryId: number;
  activeId: number;
  /** 原图，用于 PDF / 打印等高质量输出 */
  imageUrl: string;
  /** 512 卡片图，用于页面列表展示 */
  cardImageUrl: string;
  /** 答案图，用于 puzzle worksheet PDF 答案页 */
  answerImageUrl: string | null;
  title: string;
  slug: string;
  description: string;
  difficulty: number | null;
  sortOrder: number;
  isActive: boolean;
};

type D1ResultRow = FeaturedCollection;
type D1FirstCategoryRow = {
  id: number;
  parent_id?: number | null;
  slug: string;
  name: string;
  description: string | null;
  cover_image?: string | null;
  seo_image_url?: string | null;
};
type D1HomepageConfigRow = {
  title: string;
  description: string;
  hero_image_url?: string | null;
  seo_title?: string | null;
  seo_description?: string | null;
  footer_paragraph?: string | null;
  category_printable_counts?: string | null;
  total_printable_count?: number | string | null;
};

const HOMEPAGE_ACTIVITY_TITLE = "Free Printable Activities for Kids";
const HOMEPAGE_ACTIVITY_DESCRIPTION =
  "Browse free coloring pages, tracing worksheets, scissor skills, number activities, puzzles, and printable learning resources for preschool, kindergarten, home, and classroom use.";
const HOMEPAGE_ACTIVITY_SEO_TITLE =
  "Free Printable Activities for Kids | PrintlyKiddo";
const HOMEPAGE_ACTIVITY_SEO_DESCRIPTION =
  "Browse free printable activities for kids, including coloring pages, tracing worksheets, scissor skills, number activities, puzzles, and classroom-ready PDF printables.";

type D1ActiveRow = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number | null;
  colored_label: number | null;
};

type D1ImgRow = {
  id: number;
  category_id: number;
  active_id: number;
  image_url: string;
  image_url_card?: string | null;
  answer_image_url?: string | null;
  title: string | null;
  slug: string | null;
  description: string | null;
  difficulty?: number | null;
  sort_order: number | null;
  is_active: number | null;
  local_file_path?: string | null;
  local_file_path_card?: string | null;
  answer_local_file_path?: string | null;
};

type QueryAllResult<T> = {
  results: T[];
};

type QueryStatement = {
  bind(...values: unknown[]): QueryStatement;
  all<T>(): Promise<QueryAllResult<T>>;
  first<T>(): Promise<T | null>;
};

type QueryDatabase = {
  prepare(query: string): QueryStatement;
};

const DEFAULT_LOCAL_SQLITE_PATH = "../admin/data/local-admin.sqlite";
const tablePresenceCache = new Map<string, boolean>();
const columnPresenceCache = new Map<string, boolean>();

/** 区分 D1 与本机 sqlite，避免 schema 探测缓存串库 */
function getDbCachePrefix(): string {
  try {
    const { env } = getCloudflareContext();
    if ((env as CloudflareEnv).DB) {
      return "remote";
    }
  } catch {
    // 非 Workers 运行时（如 next dev）
  }
  return `local:${process.env.LOCAL_SQLITE_PATH?.trim() || DEFAULT_LOCAL_SQLITE_PATH}`;
}

type CategoryQueryShape = {
  /** 不含 parent_id（一级列表、按 id 查父级等） */
  selectFlat: string;
  /** 含 parent_id（当前类目、子级列表） */
  selectWithParent: string;
  whereCategoryDeleted: string;
};

const categoryQueryShapeCache = new Map<string, Promise<CategoryQueryShape>>();
const softDeleteShapeCache = new Map<
  string,
  Promise<{ actives: boolean; imgs: boolean }>
>();

class LocalSqliteStatement implements QueryStatement {
  constructor(
    private readonly statement: import("node:sqlite").StatementSync,
    private readonly parameters: import("node:sqlite").SQLInputValue[] = [],
  ) {}

  bind(...values: unknown[]) {
    return new LocalSqliteStatement(
      this.statement,
      values as import("node:sqlite").SQLInputValue[],
    );
  }

  async all<T>() {
    return {
      results: this.statement.all(...this.parameters) as T[],
    };
  }

  async first<T>() {
    return (this.statement.get(...this.parameters) as T | undefined) ?? null;
  }
}

class LocalSqliteDatabase implements QueryDatabase {
  constructor(private readonly database: import("node:sqlite").DatabaseSync) {}

  prepare(query: string) {
    return new LocalSqliteStatement(this.database.prepare(query));
  }
}

let localDatabasePromise: Promise<QueryDatabase> | null = null;

/** `hero_image_url`：与 `resolveSiteImageUrl` 一致（dev 走 admin 代理，线上走 CDN）。 */
function resolveHeroImageUrl(heroImageUrl: string): string {
  return resolveSiteImageUrl(heroImageUrl);
}

function getRemoteDatabase() {
  // dev 模式下强制走本地 sqlite，避免每次请求访问远端 D1 引入网络延迟
  if (process.env.NODE_ENV === "development") {
    return null;
  }
  try {
    const { env } = getCloudflareContext();
    return (env as CloudflareEnv).DB ?? null;
  } catch {
    return null;
  }
}

async function getLocalDatabase(): Promise<QueryDatabase> {
  if (!localDatabasePromise) {
    localDatabasePromise = (async () => {
      const [{ access }, pathModule, sqliteModule] = await Promise.all([
        import("node:fs/promises"),
        import("node:path"),
        import("node:sqlite"),
      ]);

      const sqlitePath = pathModule.resolve(
        process.cwd(),
        process.env.LOCAL_SQLITE_PATH?.trim() || DEFAULT_LOCAL_SQLITE_PATH,
      );

      try {
        await access(sqlitePath);
      } catch {
        throw new Error(
          `Local sqlite database not found at ${sqlitePath}. Ensure printly-admin local DB exists, or set LOCAL_SQLITE_PATH explicitly.`,
        );
      }

      return new LocalSqliteDatabase(new sqliteModule.DatabaseSync(sqlitePath));
    })();
  }

  return localDatabasePromise;
}

async function getRequiredDatabase(): Promise<QueryDatabase> {
  const remoteDatabase = getRemoteDatabase();
  if (remoteDatabase) {
    return remoteDatabase as QueryDatabase;
  }

  return getLocalDatabase();
}

function buildCategoryCoverImageUrl(
  categoryPath: string,
  coverImageId?: string | null,
  imageManifest?:
    | import("@/lib/category-functions").CategoryImageManifest
    | null,
  size: import("@/lib/category-functions").CategoryImageSize = 256,
) {
  if (!categoryPath.trim()) {
    return null;
  }

  if (imageManifest) {
    return getCategoryOriginImageUrl({
      slug: categoryPath.split("/").at(-1) ?? categoryPath,
      imagePath: categoryPath,
      imageManifest,
    });
  }

  if (!coverImageId?.trim()) {
    return null;
  }

  return buildCategoryImageUrl(categoryPath, coverImageId, size);
}

function getCategoryCoverImageId(
  rawCoverImage: string | null | undefined,
  imageManifest: CategoryImageManifest | null,
) {
  const raw = (rawCoverImage ?? "").trim();
  if (raw && !raw.startsWith("{")) {
    return raw;
  }

  return (
    imageManifest?.origin_color?.[0]?.trim() ||
    imageManifest?.origin?.[0]?.trim() ||
    null
  );
}

const LEGACY_PREHISTORIC_COVER_SLUGS = new Set([
  "mammoth",
  "saber-toothed-tiger",
  "woolly-rhinoceros",
  "dire-wolf",
  "mosasaurus",
  "plesiosaur",
]);

/** 这些物种的页面已迁出 /animals，R2 封面仍统一保留在迁移前的目录。 */
function buildLegacyPrehistoricCoverImageUrl(
  categoryPath: string,
  rawCoverImage: string | null | undefined,
  imageManifest: CategoryImageManifest | null,
  size: import("@/lib/category-functions").CategoryImageSize,
) {
  if (!categoryPath.startsWith("prehistoric-animals/")) {
    return null;
  }

  const slug = categoryPath.split("/").at(-1) ?? "";
  const imageId = getCategoryCoverImageId(rawCoverImage, imageManifest);
  if (!LEGACY_PREHISTORIC_COVER_SLUGS.has(slug) || !imageId) {
    return null;
  }

  return buildCategoryImageUrl(
    `animals/prehistoric-animals/${slug}`,
    imageId,
    size,
  );
}

/**
 * 分类调整层级后，R2 中的历史封面可能仍保留在旧目录。
 * `seo_image_url` 记录的是实际文件地址；仅当它与 cover_image 指向同一图片 ID 时，
 * 才复用它的目录生成对应尺寸，避免把独立的 SEO 图片误当作分类封面。
 */
function buildCategoryCoverImageUrlFromSeoImage(
  rawCoverImage: string | null | undefined,
  imageManifest: CategoryImageManifest | null,
  rawSeoImageUrl: string | null | undefined,
  size: import("@/lib/category-functions").CategoryImageSize,
) {
  const imageId = getCategoryCoverImageId(rawCoverImage, imageManifest);
  const seoImageUrl = rawSeoImageUrl?.trim();
  if (!imageId || !seoImageUrl) {
    return null;
  }

  try {
    const escapedImageId = imageId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const imageFilePattern = new RegExp(
      `/${escapedImageId}(?:-(?:256|512|1024))?\\.webp$`,
    );
    const absoluteUrl = /^https?:\/\//i.test(seoImageUrl)
      ? new URL(seoImageUrl)
      : null;
    const imagePath = absoluteUrl
      ? absoluteUrl.pathname
      : `/${seoImageUrl.replace(/^\/+/, "").split(/[?#]/, 1)[0]}`;
    if (!imageFilePattern.test(imagePath)) {
      return null;
    }

    const suffix = size === 256 ? "" : `-${size}`;
    const sizedImagePath = imagePath.replace(
      imageFilePattern,
      `/${imageId}${suffix}.webp`,
    );
    if (absoluteUrl) {
      absoluteUrl.pathname = sizedImagePath;
      return absoluteUrl.toString();
    }
    return resolveSiteImageUrl(sizedImagePath);
  } catch {
    return null;
  }
}

function buildCategoryCoverImageUrlForRow(
  categoryPath: string,
  rawCoverImage: string | null | undefined,
  imageManifest: CategoryImageManifest | null,
  rawSeoImageUrl: string | null | undefined,
  size: import("@/lib/category-functions").CategoryImageSize = 256,
) {
  return (
    buildLegacyPrehistoricCoverImageUrl(
      categoryPath,
      rawCoverImage,
      imageManifest,
      size,
    ) ??
    buildCategoryCoverImageUrlFromSeoImage(
      rawCoverImage,
      imageManifest,
      rawSeoImageUrl,
      size,
    ) ??
    buildCategoryCoverImageUrl(
      categoryPath,
      rawCoverImage,
      imageManifest,
      size,
    )
  );
}

function rewriteDevCategoryCoverUrl(
  builtUrl: string | null,
  rawCoverImage: string | null | undefined,
  imageManifest: CategoryImageManifest | null,
  size: import("@/lib/category-functions").CategoryImageSize = 256,
): string | null {
  if (!isPrintlyKiddoLocalDev() || !builtUrl) {
    return builtUrl;
  }
  if (size !== 256) {
    return builtUrl;
  }

  const raw = (rawCoverImage ?? "").trim();
  let previewId: string | null = null;
  if (raw && !raw.startsWith("{")) {
    previewId = raw;
  } else if (imageManifest) {
    previewId =
      imageManifest.origin_color?.[0]?.trim() ||
      imageManifest.origin?.[0]?.trim() ||
      null;
  }

  if (!previewId) {
    return builtUrl;
  }

  return buildLocalDevImageUrl({ categoryImageId: previewId });
}

async function hasTable(database: QueryDatabase, tableName: string) {
  const cacheKey = `${getDbCachePrefix()}:table:${tableName}`;
  if (tablePresenceCache.has(cacheKey)) {
    return tablePresenceCache.get(cacheKey) ?? false;
  }

  const row = await database
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
         AND name = ?1
       LIMIT 1`,
    )
    .bind(tableName)
    .first<{ name: string } | null>();
  const exists = Boolean(row?.name);
  tablePresenceCache.set(cacheKey, exists);
  return exists;
}

async function hasColumn(
  database: QueryDatabase,
  tableName: string,
  columnName: string,
): Promise<boolean> {
  const cacheKey = `${getDbCachePrefix()}:column:${tableName}:${columnName}`;
  if (columnPresenceCache.has(cacheKey)) {
    return columnPresenceCache.get(cacheKey) ?? false;
  }

  const result = await database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all<{ name: string }>();
  const exists = (result.results ?? []).some((row) => row.name === columnName);
  columnPresenceCache.set(cacheKey, exists);
  return exists;
}

async function buildCategoryQueryShape(
  database: QueryDatabase,
): Promise<CategoryQueryShape> {
  const hasDeletedAt = await hasColumn(database, "categories", "deleted_at");
  const seoImageSelect = (await hasColumn(database, "categories", "seo_image_url"))
    ? "seo_image_url"
    : "NULL AS seo_image_url";
  const tail = `cover_image, ${seoImageSelect}`;
  return {
    selectFlat: `id, slug, name, description, ${tail}`,
    selectWithParent: `id, parent_id, slug, name, description, ${tail}`,
    whereCategoryDeleted: hasDeletedAt ? "AND deleted_at IS NULL" : "",
  };
}

async function getCategoryQueryShape(
  database: QueryDatabase,
): Promise<CategoryQueryShape> {
  const prefix = getDbCachePrefix();
  let promise = categoryQueryShapeCache.get(prefix);
  if (!promise) {
    promise = buildCategoryQueryShape(database);
    categoryQueryShapeCache.set(prefix, promise);
  }
  return promise;
}

async function getSoftDeleteShape(database: QueryDatabase): Promise<{
  actives: boolean;
  imgs: boolean;
}> {
  const prefix = getDbCachePrefix();
  let promise = softDeleteShapeCache.get(prefix);
  if (!promise) {
    promise = Promise.all([
      hasColumn(database, "actives", "deleted_at"),
      hasColumn(database, "imgs", "deleted_at"),
    ]).then(([actives, imgs]) => ({ actives, imgs }));
    softDeleteShapeCache.set(prefix, promise);
  }
  return promise;
}

function mapCategoryRow(
  item: Pick<
    D1FirstCategoryRow,
    | "id"
    | "slug"
    | "name"
    | "description"
    | "cover_image"
    | "seo_image_url"
  >,
): FirstCategory {
  const imageManifest = parseCategoryImageManifest(item.cover_image);
  const imagePath = item.slug;
  const manualDescription = item.description?.trim() || null;

  return {
    id: Number(item.id),
    slug: item.slug,
    imagePath,
    title: item.name,
    description:
      manualDescription ?? "Free printable resources from this main category.",
    manualDescription,
    coverImageUrl: rewriteDevCategoryCoverUrl(
      buildCategoryCoverImageUrlForRow(
        imagePath,
        item.cover_image,
        imageManifest,
        item.seo_image_url,
      ),
      item.cover_image,
      imageManifest,
    ),
    coverImageUrl512: rewriteDevCategoryCoverUrl(
      buildCategoryCoverImageUrlForRow(
        imagePath,
        item.cover_image,
        imageManifest,
        item.seo_image_url,
        512,
      ),
      item.cover_image,
      imageManifest,
      512,
    ),
    seoImageUrl: item.seo_image_url?.trim()
      ? resolveSiteImageUrl(item.seo_image_url)
      : null,
    imageManifest,
  };
}

function mapChildCategoryRow(
  parentPath: string,
  item: Pick<
    D1FirstCategoryRow,
    | "id"
    | "slug"
    | "name"
    | "description"
    | "cover_image"
    | "seo_image_url"
  >,
): ChildCategory {
  const imageManifest = parseCategoryImageManifest(item.cover_image);
  const imagePath = `${parentPath}/${item.slug}`;
  const manualDescription = item.description?.trim() || null;

  return {
    id: Number(item.id),
    slug: item.slug,
    imagePath,
    title: item.name,
    description:
      manualDescription ?? "Free printable resources from this subcategory.",
    manualDescription,
    coverImageUrl: rewriteDevCategoryCoverUrl(
      buildCategoryCoverImageUrlForRow(
        imagePath,
        item.cover_image,
        imageManifest,
        item.seo_image_url,
      ),
      item.cover_image,
      imageManifest,
    ),
    coverImageUrl512: rewriteDevCategoryCoverUrl(
      buildCategoryCoverImageUrlForRow(
        imagePath,
        item.cover_image,
        imageManifest,
        item.seo_image_url,
        512,
      ),
      item.cover_image,
      imageManifest,
      512,
    ),
    seoImageUrl: item.seo_image_url?.trim()
      ? resolveSiteImageUrl(item.seo_image_url)
      : null,
    imageManifest,
  };
}

function mapD1CategoryRow(
  imagePath: string,
  item: Pick<
    D1FirstCategoryRow,
    | "id"
    | "slug"
    | "name"
    | "description"
    | "cover_image"
    | "seo_image_url"
  >,
): ChildCategory {
  const imageManifest = parseCategoryImageManifest(item.cover_image);
  const manualDescription = item.description?.trim() || null;

  return {
    id: Number(item.id),
    slug: item.slug,
    imagePath,
    title: item.name,
    description:
      manualDescription ?? "Free printable resources from this category.",
    manualDescription,
    coverImageUrl: rewriteDevCategoryCoverUrl(
      buildCategoryCoverImageUrlForRow(
        imagePath,
        item.cover_image,
        imageManifest,
        item.seo_image_url,
      ),
      item.cover_image,
      imageManifest,
    ),
    coverImageUrl512: rewriteDevCategoryCoverUrl(
      buildCategoryCoverImageUrlForRow(
        imagePath,
        item.cover_image,
        imageManifest,
        item.seo_image_url,
        512,
      ),
      item.cover_image,
      imageManifest,
      512,
    ),
    seoImageUrl: item.seo_image_url?.trim()
      ? resolveSiteImageUrl(item.seo_image_url)
      : null,
    imageManifest,
  };
}

/**
 * 目录卡片：未配置类目封面时，用该分类下任意一张已发布素材图作为缩略图（按 sort_order）。
 */
async function withDirectoryCoverFallback(
  database: QueryDatabase,
  items: ChildCategory[],
): Promise<ChildCategory[]> {
  const missingIds = items
    .filter((item) => !item.coverImageUrl)
    .map((item) => item.id);
  if (missingIds.length === 0) {
    return items;
  }

  if (!(await hasTable(database, "imgs"))) {
    return items;
  }

  const soft = await getSoftDeleteShape(database);
  const hasImgLocalPath = await hasColumn(database, "imgs", "local_file_path");
  const placeholders = missingIds.map(() => "?").join(", ");
  const conditions = [`category_id IN (${placeholders})`, "is_active = 1"];
  if (soft.imgs) {
    conditions.push("deleted_at IS NULL");
  }

  const imgSelect = hasImgLocalPath
    ? "category_id, image_url, sort_order, id, local_file_path"
    : "category_id, image_url, sort_order, id";

  const result = await database
    .prepare(
      `SELECT ${imgSelect}
       FROM imgs
       WHERE ${conditions.join(" AND ")}
       ORDER BY category_id ASC, sort_order ASC, id ASC`,
    )
    .bind(...missingIds)
    .all<{
      category_id: number;
      image_url: string;
      local_file_path?: string | null;
    }>();

  const firstUrlByCategoryId = new Map<number, string>();
  for (const row of result.results ?? []) {
    const cid = Number(row.category_id);
    if (firstUrlByCategoryId.has(cid)) {
      continue;
    }
    firstUrlByCategoryId.set(
      cid,
      resolveMaterialImageUrlFromDatabase(row.image_url, row.local_file_path),
    );
  }

  return items.map((item) => {
    if (item.coverImageUrl) {
      return item;
    }
    const fallback = firstUrlByCategoryId.get(item.id);
    if (!fallback) {
      return item;
    }
    return { ...item, coverImageUrl: fallback };
  });
}

function mapActiveRow(item: D1ActiveRow): ActiveSummary {
  const display = getActiveDisplayCopy(item.slug, item.name, item.description);
  return {
    id: Number(item.id),
    name: display.name,
    slug: item.slug,
    description: display.description,
    sortOrder: Number(item.sort_order ?? 0),
    coloredLabel: item.colored_label === 1,
  };
}

function getActiveDisplayCopy(
  slug: string,
  fallbackName: string,
  fallbackDescription?: string | null,
) {
  const displayBySlug: Record<string, { name: string; description: string }> = {
    "tracing-worksheets": {
      name: "Tracing Worksheets",
      description:
        "Printable tracing worksheets for preschool pre-writing and fine motor practice.",
    },
    cut: {
      name: "Scissor Skills Worksheets",
      description:
        "Printable cutting practice worksheets for scissor skills and fine motor development.",
    },
    "number-sequencing": {
      name: "Number Sequence Puzzles",
      description:
        "Printable number sequence puzzles for ordering numbered strips and rebuilding pictures.",
    },
    "grid-puzzles": {
      name: "Grid Puzzles",
      description:
        "Printable grid puzzles for cut-and-paste picture matching and fine motor practice.",
    },
  };

  const override = displayBySlug[slug];
  if (override) {
    return override;
  }

  return {
    name: fallbackName,
    description:
      fallbackDescription ??
      `Printable ${fallbackName.toLowerCase()} resources for this topic.`,
  };
}

function mapImgRow(item: D1ImgRow): ImgSummary {
  const imageUrl = resolveMaterialImageUrlFromDatabase(
    item.image_url,
    item.local_file_path,
  );
  const cardImageUrl = item.image_url_card?.trim()
    ? resolveMaterialImageUrlFromDatabase(
        item.image_url_card,
        item.local_file_path_card,
      )
    : imageUrl;
  const answerImageUrl = item.answer_image_url?.trim()
    ? resolveMaterialImageUrlFromDatabase(
        item.answer_image_url,
        item.answer_local_file_path,
      )
    : null;
  const title = item.title?.trim() || "Printable image";
  const slug = item.slug?.trim() || `img-${item.id}`;
  const difficulty =
    item.difficulty === null || item.difficulty === undefined
      ? null
      : Number(item.difficulty);

  return {
    id: Number(item.id),
    categoryId: Number(item.category_id),
    activeId: Number(item.active_id),
    imageUrl,
    cardImageUrl,
    answerImageUrl,
    title,
    slug,
    description: item.description?.trim() || "",
    difficulty: difficulty === 1 || difficulty === 2 || difficulty === 3 ? difficulty : null,
    sortOrder: Number(item.sort_order ?? 0),
    isActive: item.is_active !== 0,
  };
}

async function loadFirstCategories(limit?: number): Promise<FirstCategory[]> {
  const database = await getRequiredDatabase();
  const { selectFlat, whereCategoryDeleted } =
    await getCategoryQueryShape(database);
  const limitClause = typeof limit === "number" ? "LIMIT ?1" : "";
  const statement = database.prepare(
    `SELECT ${selectFlat}
     FROM categories
     WHERE parent_id IS NULL
       AND is_active = 1
       AND LOWER(slug) NOT IN ('puzzle', 'puzzles')
       ${whereCategoryDeleted}
     ORDER BY sort_order ASC, id ASC
     ${limitClause}`,
  );

  const result = await (typeof limit === "number" ? statement.bind(limit) : statement)
    .all<D1FirstCategoryRow>();

  if (!result.results?.length) {
    return [];
  }

  return result.results.map((item: D1FirstCategoryRow) => mapCategoryRow(item));
}

/**
 * 跨请求级缓存：一级类目变动极少（运营改类目时再 revalidateTag 失效）。
 * - React `cache` 仅去重同请求内调用；
 * - 用 Next 的 `unstable_cache` + tag 实现跨请求 / 跨实例的持久缓存（OpenNext on
 *   Cloudflare 默认会落到 KV / R2）。
 */
const getFirstCategoriesUnlimited = unstable_cache(
  () => loadFirstCategories(),
  ["first-categories", "all"],
  { tags: [CATEGORIES_CACHE_TAG], revalidate: CATEGORY_REVALIDATE_SECONDS },
);

const getFirstCategoriesLimited = unstable_cache(
  (limit: number) => loadFirstCategories(limit),
  ["first-categories", "limit"],
  { tags: [CATEGORIES_CACHE_TAG], revalidate: CATEGORY_REVALIDATE_SECONDS },
);

export async function getFirstCategories(limit?: number): Promise<FirstCategory[]> {
  let regularCategories: FirstCategory[];
  if (process.env.NODE_ENV === "development") {
    regularCategories = await loadFirstCategories(limit);
  } else if (typeof limit === "number") {
    regularCategories = await getFirstCategoriesLimited(limit);
  } else {
    regularCategories = await getFirstCategoriesUnlimited();
  }
  const categories = isStaticPuzzleCategoryActive("puzzles")
    ? [...regularCategories, getStaticPuzzleRootCategory()]
    : regularCategories;
  return typeof limit === "number" ? categories.slice(0, limit) : categories;
}

type WordSearchTopicRow = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  tag_slug: string;
  tag_name: string;
};

type WordSearchItemRow = {
  topic_id: number;
  word: string;
  related_words: string;
};

type WordSearchData = {
  themes: WordSearchTheme[];
  library: WordLibraryGroup[];
};

function parseRelatedWords(value: string) {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((word): word is string => typeof word === "string") : [];
  } catch {
    return [];
  }
}

function getPublicWordSearchDescription(name: string, description: string | null) {
  const value = description?.trim();
  return value && !/[\u3400-\u9fff]/u.test(value)
    ? value
    : `Practice ${name.toLowerCase()} vocabulary with a printable word search for kids.`;
}

/**
 * Word Search has one source of truth: printly-admin's Activity Item Library.
 * `next dev` reads the local SQLite database on each request. Production builds
 * read the same database while pre-rendering the static tool and topic pages.
 */
async function loadWordSearchData(): Promise<WordSearchData> {
  const database = await getRequiredDatabase();
  const [topicResult, itemResult] = await Promise.all([
    database.prepare(
      `SELECT t.id, t.slug, t.name, t.description,
              COALESCE(tag.slug, 'more-topics') AS tag_slug,
              COALESCE(tag.name, 'More Topics') AS tag_name
       FROM activity_topics t
       LEFT JOIN activity_topic_tags rel ON rel.topic_id = t.id
       LEFT JOIN activity_tags tag ON tag.id = rel.tag_id
       WHERE t.status = 'published'
       ORDER BY COALESCE(tag.sort_order, 2147483647), tag.name COLLATE NOCASE,
                t.sort_order, t.name COLLATE NOCASE`,
    ).all<WordSearchTopicRow>(),
    database.prepare(
      `SELECT rel.topic_id, item.word, item.related_words
       FROM activity_item_topics rel
       INNER JOIN activity_items item ON item.id = rel.item_id
       INNER JOIN activity_topics topic ON topic.id = rel.topic_id
       WHERE item.status = 'published' AND topic.status = 'published'
       ORDER BY item.name COLLATE NOCASE`,
    ).all<WordSearchItemRow>(),
  ]);

  const wordsByTopic = new Map<number, string[]>();
  for (const item of itemResult.results ?? []) {
    const words = wordsByTopic.get(Number(item.topic_id)) ?? [];
    words.push(item.word, ...parseRelatedWords(item.related_words));
    wordsByTopic.set(Number(item.topic_id), words);
  }

  const themes = (topicResult.results ?? []).map((topic) => ({
    id: Number(topic.id),
    slug: topic.slug,
    name: topic.name,
    description: getPublicWordSearchDescription(topic.name, topic.description),
    words: normalizeWords(wordsByTopic.get(Number(topic.id)) ?? []),
    group: topic.tag_name,
    groupSlug: topic.tag_slug,
    parentGroup: topic.tag_name,
    parentGroupSlug: topic.tag_slug,
    categoryPath: null,
  })).filter((theme) => theme.words.length > 0);

  const groups = new Map<string, WordLibraryGroup>();
  for (const theme of themes) {
    const group = groups.get(theme.groupSlug) ?? { slug: theme.groupSlug, name: theme.group, topics: [] };
    group.topics.push({ slug: theme.slug, name: theme.name, words: theme.words });
    groups.set(theme.groupSlug, group);
  }

  return { themes, library: [...groups.values()] };
}

const getWordSearchData = cache(loadWordSearchData);

export async function getWordSearchThemes(): Promise<WordSearchTheme[]> {
  return (await getWordSearchData()).themes;
}

export async function getWordSearchLibrary(): Promise<WordLibraryGroup[]> {
  return (await getWordSearchData()).library;
}

export async function getWordSearchTheme(slug: string): Promise<WordSearchTheme | null> {
  return (await getWordSearchThemes()).find((theme) => theme.slug === slug) ?? null;
}

/** 统计每个一级类目下全部子孙类目的可打印素材数量。 */
async function loadFirstCategoryPrintableCounts(): Promise<Record<number, number>> {
  const database = await getRequiredDatabase();
  if (!(await hasTable(database, "imgs"))) {
    return {};
  }

  const soft = await getSoftDeleteShape(database);
  const { whereCategoryDeleted } = await getCategoryQueryShape(database);
  const imgDeletedClause = soft.imgs ? "AND i.deleted_at IS NULL" : "";

  const result = await database
    .prepare(
      `WITH RECURSIVE cat_tree(id, root_id) AS (
         SELECT id, id
         FROM categories
         WHERE parent_id IS NULL
           AND is_active = 1
           ${whereCategoryDeleted}
         UNION ALL
         SELECT c.id, t.root_id
         FROM categories c
         INNER JOIN cat_tree t ON c.parent_id = t.id
         WHERE c.is_active = 1
           ${whereCategoryDeleted}
       )
       SELECT t.root_id AS root_id, COUNT(i.id) AS printable_count
       FROM cat_tree t
       LEFT JOIN imgs i
         ON i.category_id = t.id
        AND i.is_active = 1
        ${imgDeletedClause}
       GROUP BY t.root_id`,
    )
    .all<{ root_id: number; printable_count: number }>();

  const counts: Record<number, number> = {};
  for (const row of result.results ?? []) {
    counts[Number(row.root_id)] = Number(row.printable_count ?? 0);
  }
  return counts;
}

const getFirstCategoryPrintableCountsCached = unstable_cache(
  () => loadFirstCategoryPrintableCounts(),
  ["first-category-printable-counts"],
  { tags: [CATEGORIES_CACHE_TAG], revalidate: CATEGORY_REVALIDATE_SECONDS },
);

export async function getFirstCategoryPrintableCounts(): Promise<Record<number, number>> {
  if (process.env.NODE_ENV === "development") {
    return loadFirstCategoryPrintableCounts();
  }

  return getFirstCategoryPrintableCountsCached();
}

export type HomeCategoryCard = FirstCategory & {
  printableCount: number;
};

function mapHomeCategoryCards(categories: FirstCategory[], homepage: HomepageConfig): HomeCategoryCard[] {
  const puzzlePages = getStaticPuzzlePages();
  const puzzleCount = puzzlePages.reduce(
    (sum, page) => sum + page.assets.filter((asset) => asset.asset_kind === "puzzle").length,
    0,
  );

  return categories.map((category) => ({
    ...category,
    printableCount: category.slug === "puzzles"
      ? puzzleCount
      : homepage.categoryPrintableCounts[category.slug] ?? 0,
  }));
}

export async function getHomeCategoryCards(): Promise<HomeCategoryCard[]> {
  const [categories, homepage] = await Promise.all([
    getFirstCategories(),
    getHomepageConfig(),
  ]);
  return mapHomeCategoryCards(categories, homepage);
}

/** Uncached build input for pages that must remain immutable after deployment. */
export async function getStaticHomeCategoryCards(): Promise<HomeCategoryCard[]> {
  const [regularCategories, homepage] = await Promise.all([
    loadFirstCategories(),
    loadHomepageConfig(),
  ]);
  const categories = isStaticPuzzleCategoryActive("puzzles")
    ? [...regularCategories, getStaticPuzzleRootCategory()]
    : regularCategories;
  return mapHomeCategoryCards(categories, homepage);
}

export async function getChildCategoriesByParentSlug(
  parentSlug: string,
): Promise<{
  parent: FirstCategory | null;
  data: ChildCategory[];
}> {
  const database = await getRequiredDatabase();
  const { selectFlat, selectWithParent, whereCategoryDeleted } =
    await getCategoryQueryShape(database);

  const parentResult = await database
    .prepare(
      `SELECT ${selectFlat}
       FROM categories
       WHERE slug = ?1
         AND parent_id IS NULL
         AND is_active = 1
         ${whereCategoryDeleted}
       LIMIT 1`,
    )
    .bind(parentSlug)
    .first<D1FirstCategoryRow | null>();

  if (!parentResult) {
    return { parent: null, data: [] };
  }

  const childResult = await database
    .prepare(
      `SELECT ${selectWithParent}
       FROM categories
       WHERE parent_id = ?1
         AND is_active = 1
         ${whereCategoryDeleted}
       ORDER BY sort_order ASC, id ASC`,
    )
    .bind(parentResult.id)
    .all<D1FirstCategoryRow>();

  const data = (childResult.results ?? []).map((item: D1FirstCategoryRow) =>
    mapChildCategoryRow(parentSlug, item),
  );

  return {
    parent: mapCategoryRow(parentResult),
    data: await withDirectoryCoverFallback(database, data),
  };
}

export async function getCategoryPageBySlug(
  slug: string,
): Promise<CategoryPageData> {
  if (slug === "puzzles") {
    return getStaticPuzzleCategoryPage([slug]) ?? {
      current: null, parent: null, secondLevel: null, data: [], listingMode: "children",
    };
  }
  const database = await getRequiredDatabase();
  const { selectFlat, selectWithParent, whereCategoryDeleted } =
    await getCategoryQueryShape(database);

  const currentResult = await database
    .prepare(
      `SELECT ${selectWithParent}
       FROM categories
       WHERE slug = ?1
         AND is_active = 1
         ${whereCategoryDeleted}
       LIMIT 1`,
    )
    .bind(slug)
    .first<D1FirstCategoryRow | null>();

  if (!currentResult) {
    return {
      current: null,
      parent: null,
      secondLevel: null,
      data: [],
      listingMode: "children",
    };
  }

  const [parentResult, relatedResult] = await Promise.all([
    currentResult.parent_id
      ? database
          .prepare(
            `SELECT ${selectFlat}
             FROM categories
             WHERE id = ?1
               AND is_active = 1
               ${whereCategoryDeleted}
             LIMIT 1`,
          )
          .bind(currentResult.parent_id)
          .first<D1FirstCategoryRow | null>()
      : Promise.resolve(null),
    database
      .prepare(
        `SELECT ${selectWithParent}
         FROM categories
         WHERE parent_id = ?1
           AND is_active = 1
           ${whereCategoryDeleted}
         ORDER BY sort_order ASC, id ASC`,
      )
      .bind(currentResult.parent_id ?? currentResult.id)
      .all<D1FirstCategoryRow>(),
  ]);

  const data = (relatedResult.results ?? []).map((item: D1FirstCategoryRow) =>
    mapD1CategoryRow(`${slug}/${item.slug}`, item),
  );

  return {
    current: mapD1CategoryRow(slug, currentResult),
    parent: parentResult ? mapCategoryRow(parentResult) : null,
    secondLevel: null,
    data: await withDirectoryCoverFallback(database, data),
    listingMode: currentResult.parent_id === null ? "children" : "siblings",
  };
}

export async function getNestedCategoryPageByPath(
  parentSlug: string,
  slug: string,
): Promise<CategoryPageData> {
  if (parentSlug === "puzzles") {
    return getStaticPuzzleCategoryPage([parentSlug, slug]) ?? {
      current: null, parent: getStaticPuzzleRootCategory(), secondLevel: null, data: [], listingMode: "children",
    };
  }
  const database = await getRequiredDatabase();
  const { selectFlat, selectWithParent, whereCategoryDeleted } =
    await getCategoryQueryShape(database);

  const parentResult = await database
    .prepare(
      `SELECT ${selectFlat}
         FROM categories
         WHERE slug = ?1
           AND parent_id IS NULL
           AND is_active = 1
           ${whereCategoryDeleted}
         LIMIT 1`,
    )
    .bind(parentSlug)
    .first<D1FirstCategoryRow | null>();

  if (!parentResult) {
    return {
      current: null,
      parent: null,
      secondLevel: null,
      data: [],
      listingMode: "children",
    };
  }

  const currentResult = await database
    .prepare(
      `SELECT ${selectWithParent}
         FROM categories
         WHERE slug = ?1
           AND parent_id = ?2
           AND is_active = 1
           ${whereCategoryDeleted}
         LIMIT 1`,
    )
    .bind(slug, parentResult.id)
    .first<D1FirstCategoryRow | null>();

  if (!currentResult) {
    return {
      current: null,
      parent: mapCategoryRow(parentResult),
      secondLevel: null,
      data: [],
      listingMode: "children",
    };
  }

  const childResult = await database
    .prepare(
      `SELECT ${selectWithParent}
         FROM categories
         WHERE parent_id = ?1
           AND is_active = 1
           ${whereCategoryDeleted}
         ORDER BY sort_order ASC, id ASC`,
    )
    .bind(currentResult.id)
    .all<D1FirstCategoryRow>();

  const data = (childResult.results ?? []).map((item: D1FirstCategoryRow) =>
    mapD1CategoryRow(`${parentSlug}/${slug}/${item.slug}`, item),
  );

  return {
    current: mapD1CategoryRow(`${parentSlug}/${slug}`, currentResult),
    parent: mapCategoryRow(parentResult),
    secondLevel: null,
    data: await withDirectoryCoverFallback(database, data),
    listingMode: "children",
  };
}

/** 一级 / 二级 / 三级 slug，用于 `/{一级}/{二级}/{三级}/{功能}` 页面 */
export async function getThirdLevelCategoryPage(
  parentSlug: string,
  secondSlug: string,
  thirdSlug: string,
): Promise<CategoryPageData> {
  if (parentSlug === "puzzles") {
    return getStaticPuzzleCategoryPage([parentSlug, secondSlug, thirdSlug]) ?? {
      current: null, parent: getStaticPuzzleRootCategory(), secondLevel: null, data: [], listingMode: "children",
    };
  }
  const empty = (): CategoryPageData => ({
    current: null,
    parent: null,
    secondLevel: null,
    data: [],
    listingMode: "children",
  });

  const database = await getRequiredDatabase();
  const { selectFlat, selectWithParent, whereCategoryDeleted } =
    await getCategoryQueryShape(database);

  const parentResult = await database
    .prepare(
      `SELECT ${selectFlat}
       FROM categories
       WHERE slug = ?1
         AND parent_id IS NULL
         AND is_active = 1
         ${whereCategoryDeleted}
       LIMIT 1`,
    )
    .bind(parentSlug)
    .first<D1FirstCategoryRow | null>();

  if (!parentResult) {
    return empty();
  }

  const secondResult = await database
    .prepare(
      `SELECT ${selectWithParent}
       FROM categories
       WHERE slug = ?1
         AND parent_id = ?2
         AND is_active = 1
         ${whereCategoryDeleted}
       LIMIT 1`,
    )
    .bind(secondSlug, parentResult.id)
    .first<D1FirstCategoryRow | null>();

  if (!secondResult) {
    return {
      current: null,
      parent: mapCategoryRow(parentResult),
      secondLevel: null,
      data: [],
      listingMode: "children",
    };
  }

  const thirdResult = await database
    .prepare(
      `SELECT ${selectWithParent}
       FROM categories
       WHERE slug = ?1
         AND parent_id = ?2
         AND is_active = 1
         ${whereCategoryDeleted}
       LIMIT 1`,
    )
    .bind(thirdSlug, secondResult.id)
    .first<D1FirstCategoryRow | null>();

  if (!thirdResult) {
    return {
      current: null,
      parent: mapCategoryRow(parentResult),
      secondLevel: mapD1CategoryRow(
        `${parentSlug}/${secondSlug}`,
        secondResult,
      ),
      data: [],
      listingMode: "children",
    };
  }

  const childResult = await database
    .prepare(
      `SELECT ${selectWithParent}
       FROM categories
       WHERE parent_id = ?1
         AND is_active = 1
         ${whereCategoryDeleted}
       ORDER BY sort_order ASC, id ASC`,
    )
    .bind(thirdResult.id)
    .all<D1FirstCategoryRow>();

  const data = (childResult.results ?? []).map((item: D1FirstCategoryRow) =>
    mapD1CategoryRow(
      `${parentSlug}/${secondSlug}/${thirdSlug}/${item.slug}`,
      item,
    ),
  );

  return {
    current: mapD1CategoryRow(
      `${parentSlug}/${secondSlug}/${thirdSlug}`,
      thirdResult,
    ),
    parent: mapCategoryRow(parentResult),
    secondLevel: mapD1CategoryRow(`${parentSlug}/${secondSlug}`, secondResult),
    data: await withDirectoryCoverFallback(database, data),
    listingMode: "children",
  };
}

export async function getFeaturedCollections(
  limit = 3,
): Promise<FeaturedCollection[]> {
  const database = await getRequiredDatabase();
  if (!(await hasTable(database, "special_pages"))) {
    return [];
  }
  const cardImageSelect = (await hasColumn(database, "special_pages", "card_image_url"))
    ? "card_image_url"
    : "NULL AS card_image_url";
  const themeColorSelect = (await hasColumn(database, "special_pages", "theme_color"))
    ? "theme_color"
    : "'#7ADDE8' AS theme_color";

  const result = await database
    .prepare(
      `SELECT slug, title, subtitle, description, hero_image_url, ${cardImageSelect}, ${themeColorSelect}, content_json
       FROM special_pages
       WHERE status = 'published' AND deleted_at IS NULL
       ORDER BY sort_order ASC, updated_at DESC, id DESC
       LIMIT ?1`,
    )
    .bind(limit)
    .all<{
      slug: string;
      title: string;
      subtitle: string | null;
      description: string | null;
      hero_image_url: string | null;
      card_image_url: string | null;
      theme_color: string | null;
      content_json: string | null;
    }>();

  if (!result.results?.length) {
    return [];
  }

  return result.results.map((row) => ({
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    heroImageUrl: row.hero_image_url
      ? resolveMaterialImageUrlFromDatabase(row.hero_image_url)
      : null,
    cardImageUrl: row.card_image_url
      ? resolveMaterialImageUrlFromDatabase(row.card_image_url)
      : null,
    themeColor: /^#[0-9A-F]{6}$/i.test(row.theme_color || "")
      ? String(row.theme_color).toUpperCase()
      : "#7ADDE8",
    itemCount: parseSpecialPageItems(row.content_json).length,
  }));
}

function parseSpecialPageItems(value?: string | null): SpecialPageItem[] {
  if (!value?.trim()) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as {
      items?: Array<{
        type?: string;
        title?: string;
        description?: string;
        url?: string;
        imageUrl?: string | null;
        sortOrder?: number;
      }>;
    };
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    return items
      .filter((item) => item.type === "category" && item.title?.trim() && item.url?.trim())
      .map((item, index) => ({
        type: "category" as const,
        title: item.title?.trim() ?? "",
        description: item.description?.trim() ?? "",
        url: item.url?.trim() ?? "",
        imageUrl: item.imageUrl
          ? resolveMaterialImageUrlFromDatabase(
              item.imageUrl.replace(/-(?:512|1024)(\.webp)(?=$|[?#])/i, "$1"),
            )
          : null,
        sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : index,
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  } catch {
    return [];
  }
}

async function loadSpecialPageBySlug(slug: string): Promise<SpecialPage | null> {
  const normalizedSlug = slug.trim();
  if (!normalizedSlug) {
    return null;
  }

  const database = await getRequiredDatabase();
  if (!(await hasTable(database, "special_pages"))) {
    return null;
  }
  const themeColorSelect = (await hasColumn(database, "special_pages", "theme_color"))
    ? "theme_color"
    : "'#7ADDE8' AS theme_color";

  const row = await database
    .prepare(
      `SELECT slug, title, subtitle, description, seo_title, seo_description, hero_image_url, ${themeColorSelect}, content_json
       FROM special_pages
       WHERE slug = ?1 AND status = 'published' AND deleted_at IS NULL
       LIMIT 1`,
    )
    .bind(normalizedSlug)
    .first<{
      slug: string;
      title: string;
      subtitle: string | null;
      description: string | null;
      seo_title: string | null;
      seo_description: string | null;
      hero_image_url: string | null;
      theme_color: string | null;
      content_json: string | null;
    }>();

  if (!row) {
    return null;
  }

  const items = parseSpecialPageItems(row.content_json);

  return {
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    description: row.description,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    heroImageUrl: row.hero_image_url
      ? resolveMaterialImageUrlFromDatabase(row.hero_image_url)
      : null,
    cardImageUrl: null,
    themeColor: /^#[0-9A-F]{6}$/i.test(row.theme_color || "")
      ? String(row.theme_color).toUpperCase()
      : "#7ADDE8",
    itemCount: items.length,
    items,
  };
}

/** generateMetadata 与页面组件会读取同一个专题，同请求内只查询一次 D1。 */
export const getSpecialPageBySlug = cache(loadSpecialPageBySlug);

function parseHomepageCategoryPrintableCounts(value?: string | null) {
  if (!value?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .map(([slug, count]) => [slug, Number(count ?? 0)] as const)
        .filter(([, count]) => Number.isFinite(count) && count > 0),
    );
  } catch {
    return {};
  }
}

function isLegacyHomepagePositioning(value?: string | null) {
  const text = value?.trim().toLowerCase() ?? "";
  return (
    text.includes("planning") ||
    text.includes("homes stay on track") ||
    text.includes("organized daily life") ||
    text.includes("educational printables")
  );
}

function normalizeHomepageTitle(title: string) {
  return isLegacyHomepagePositioning(title)
    ? HOMEPAGE_ACTIVITY_TITLE
    : title.trim();
}

function normalizeHomepageDescription(description: string) {
  return isLegacyHomepagePositioning(description)
    ? HOMEPAGE_ACTIVITY_DESCRIPTION
    : description.trim();
}

function normalizeHomepageSeoTitle(
  seoTitle: string | null | undefined,
  title: string,
) {
  const value = seoTitle?.trim() || title.trim();
  return isLegacyHomepagePositioning(value)
    ? HOMEPAGE_ACTIVITY_SEO_TITLE
    : value;
}

function normalizeHomepageSeoDescription(
  seoDescription: string | null | undefined,
  description: string,
) {
  const value = seoDescription?.trim() || description.trim();
  return isLegacyHomepagePositioning(value)
    ? HOMEPAGE_ACTIVITY_SEO_DESCRIPTION
    : value;
}

async function loadHomepageConfig(): Promise<HomepageConfig> {
  const database = await getRequiredDatabase();
  const [hasCategoryPrintableCounts, hasTotalPrintableCount] = await Promise.all([
    hasColumn(database, "homepage_config", "category_printable_counts"),
    hasColumn(database, "homepage_config", "total_printable_count"),
  ]);
  const categoryPrintableCountsSelect = hasCategoryPrintableCounts
    ? "category_printable_counts"
    : "'{}' AS category_printable_counts";
  const totalPrintableCountSelect = hasTotalPrintableCount
    ? "total_printable_count"
    : "0 AS total_printable_count";

  const row = await database
    .prepare(
      `SELECT title, description, hero_image_url, seo_title, seo_description, footer_paragraph,
              ${categoryPrintableCountsSelect}, ${totalPrintableCountSelect}
       FROM homepage_config
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
    )
    .first<D1HomepageConfigRow | null>();

  if (
    !row?.title?.trim() ||
    !row.description?.trim()
  ) {
    throw new Error(
      "homepage_config: no row or missing required fields (title, description).",
    );
  }
  const rawCategoryCounts = parseHomepageCategoryPrintableCounts(
    row.category_printable_counts,
  );
  const title = normalizeHomepageTitle(row.title);
  const description = normalizeHomepageDescription(row.description);

  return {
    title,
    description,
    heroImageUrl: row.hero_image_url?.trim()
      ? resolveHeroImageUrl(row.hero_image_url.trim())
      : "",
    seoTitle: normalizeHomepageSeoTitle(row.seo_title, row.title),
    seoDescription: normalizeHomepageSeoDescription(
      row.seo_description,
      row.description,
    ),
    footerParagraph: row.footer_paragraph?.trim() ?? "",
    categoryPrintableCounts: rawCategoryCounts,
    totalPrintableCount:
      Number(row.total_printable_count ?? 0) ||
      Object.values(rawCategoryCounts).reduce((sum, count) => sum + count, 0),
  };
}

/** 同请求内去重（generateMetadata 与页面组件可同时调用） */
export const getHomepageConfig = cache(loadHomepageConfig);

export async function getActives(): Promise<ActiveSummary[]> {
  const database = await getRequiredDatabase();

  if (!(await hasTable(database, "actives"))) {
    return [];
  }

  const soft = await getSoftDeleteShape(database);
  const deletedClause = soft.actives ? "WHERE deleted_at IS NULL" : "";

  const result = await database
    .prepare(
      `SELECT id, name, slug, description, sort_order, colored_label
       FROM actives
       ${deletedClause}
       ORDER BY sort_order ASC, id ASC`,
    )
    .all<D1ActiveRow>();

  return (result.results ?? []).map(mapActiveRow);
}

type GetImgsByFiltersInput = {
  categoryId: number;
  activeId: number;
};

export async function getImgsByFilters({
  categoryId,
  activeId,
}: GetImgsByFiltersInput): Promise<ImgSummary[]> {
  const database = await getRequiredDatabase();
  if (!(await hasTable(database, "imgs"))) {
    return [];
  }

  const soft = await getSoftDeleteShape(database);
  const hasImgLocalPath = await hasColumn(database, "imgs", "local_file_path");
  const hasImgCardUrl = await hasColumn(database, "imgs", "image_url_card");
  const hasImgCardLocalPath = await hasColumn(
    database,
    "imgs",
    "local_file_path_card",
  );
  const hasAnswerImageUrl = await hasColumn(database, "imgs", "answer_image_url");
  const hasAnswerLocalFilePath = await hasColumn(
    database,
    "imgs",
    "answer_local_file_path",
  );
  const hasDifficulty = await hasColumn(database, "imgs", "difficulty");
  const conditions = ["category_id = ?1", "active_id = ?2", "is_active = 1"];
  if (soft.imgs) {
    conditions.push("deleted_at IS NULL");
  }
  const values: unknown[] = [categoryId, activeId];

  const imgSelect = hasImgLocalPath
    ? `id,
         category_id,
         active_id,
         image_url,
         ${hasImgCardUrl ? "image_url_card" : "NULL AS image_url_card"},
         ${hasAnswerImageUrl ? "answer_image_url" : "NULL AS answer_image_url"},
         title,
         slug,
         description,
         ${hasDifficulty ? "difficulty" : "NULL AS difficulty"},
         sort_order,
         is_active,
         local_file_path,
         ${hasImgCardLocalPath ? "local_file_path_card" : "NULL AS local_file_path_card"},
         ${hasAnswerLocalFilePath ? "answer_local_file_path" : "NULL AS answer_local_file_path"}`
    : `id,
         category_id,
         active_id,
         image_url,
         ${hasImgCardUrl ? "image_url_card" : "NULL AS image_url_card"},
         ${hasAnswerImageUrl ? "answer_image_url" : "NULL AS answer_image_url"},
         title,
         slug,
         description,
         ${hasDifficulty ? "difficulty" : "NULL AS difficulty"},
         sort_order,
         is_active,
         NULL AS local_file_path_card,
         NULL AS answer_local_file_path`;

  const result = await database
    .prepare(
      `SELECT ${imgSelect}
       FROM imgs
       WHERE ${conditions.join(" AND ")}
       ORDER BY
         CASE WHEN difficulty IS NULL THEN 9 ELSE difficulty END ASC,
         sort_order ASC,
         id ASC`,
    )
    .bind(...values)
    .all<D1ImgRow>();

  return (result.results ?? []).map(mapImgRow);
}


type GetImgsByFiltersBatchInput = {
  /** 类目 id 集合 */
  categoryIds: number[];
  /** active id 集合 */
  activeIds: number[];
};

type CategoryActiveImgsKey = `${number}:${number}`;

export type CategoryActiveImgsMap = Map<CategoryActiveImgsKey, ImgSummary[]>;

function buildCategoryActiveKey(
  categoryId: number,
  activeId: number,
): CategoryActiveImgsKey {
  return `${categoryId}:${activeId}`;
}

/**
 * 一次 IN 查询拉回多个 (categoryId, activeId) 组合的图片。
 * 适用于资源页与 /api/pdf-topics —— 把原来 N×M 次单查询合并成 1 次 D1 RTT。
 *
 * 返回 Map：以 `${categoryId}:${activeId}` 为 key，值是排序后的 ImgSummary[]。
 * 没有数据的组合不会出现在 Map 里，调用方按需 fallback 到空数组。
 */
export async function getImgsByCategoryActiveBatch({
  categoryIds,
  activeIds,
}: GetImgsByFiltersBatchInput): Promise<CategoryActiveImgsMap> {
  const result: CategoryActiveImgsMap = new Map();
  if (categoryIds.length === 0 || activeIds.length === 0) {
    return result;
  }

  const database = await getRequiredDatabase();
  if (!(await hasTable(database, "imgs"))) {
    return result;
  }

  const soft = await getSoftDeleteShape(database);
  const hasImgLocalPath = await hasColumn(database, "imgs", "local_file_path");
  const hasImgCardUrl = await hasColumn(database, "imgs", "image_url_card");
  const hasImgCardLocalPath = await hasColumn(
    database,
    "imgs",
    "local_file_path_card",
  );
  const hasAnswerImageUrl = await hasColumn(database, "imgs", "answer_image_url");
  const hasAnswerLocalFilePath = await hasColumn(
    database,
    "imgs",
    "answer_local_file_path",
  );
  const hasDifficulty = await hasColumn(database, "imgs", "difficulty");

  const categoryPlaceholders = categoryIds.map(() => "?").join(", ");
  const activePlaceholders = activeIds.map(() => "?").join(", ");
  const conditions = [
    `category_id IN (${categoryPlaceholders})`,
    `active_id IN (${activePlaceholders})`,
    "is_active = 1",
  ];
  if (soft.imgs) {
    conditions.push("deleted_at IS NULL");
  }

  const imgSelect = hasImgLocalPath
    ? `id,
       category_id,
       active_id,
       image_url,
       ${hasImgCardUrl ? "image_url_card" : "NULL AS image_url_card"},
       ${hasAnswerImageUrl ? "answer_image_url" : "NULL AS answer_image_url"},
       title,
       slug,
       description,
       ${hasDifficulty ? "difficulty" : "NULL AS difficulty"},
       sort_order,
       is_active,
       local_file_path,
       ${hasImgCardLocalPath ? "local_file_path_card" : "NULL AS local_file_path_card"},
       ${hasAnswerLocalFilePath ? "answer_local_file_path" : "NULL AS answer_local_file_path"}`
    : `id,
       category_id,
       active_id,
       image_url,
       ${hasImgCardUrl ? "image_url_card" : "NULL AS image_url_card"},
       ${hasAnswerImageUrl ? "answer_image_url" : "NULL AS answer_image_url"},
       title,
       slug,
       description,
       ${hasDifficulty ? "difficulty" : "NULL AS difficulty"},
       sort_order,
       is_active,
       NULL AS local_file_path_card,
       NULL AS answer_local_file_path`;

  const queryResult = await database
    .prepare(
      `SELECT ${imgSelect}
       FROM imgs
       WHERE ${conditions.join(" AND ")}
       ORDER BY
         category_id ASC,
         active_id ASC,
         CASE WHEN difficulty IS NULL THEN 9 ELSE difficulty END ASC,
         sort_order ASC,
         id ASC`,
    )
    .bind(...categoryIds, ...activeIds)
    .all<D1ImgRow>();

  for (const row of queryResult.results ?? []) {
    const item = mapImgRow(row);
    const key = buildCategoryActiveKey(item.categoryId, item.activeId);
    const existing = result.get(key);
    if (existing) {
      existing.push(item);
    } else {
      result.set(key, [item]);
    }
  }

  return result;
}

/**
 * 在批量结果上按 (categoryId, activeId) 取出来；没有就返回空数组。
 */
export function getImgsFromBatch(
  batch: CategoryActiveImgsMap,
  categoryId: number,
  activeId: number,
): ImgSummary[] {
  return batch.get(buildCategoryActiveKey(categoryId, activeId)) ?? [];
}
