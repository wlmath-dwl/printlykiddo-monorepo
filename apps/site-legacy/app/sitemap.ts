import type { MetadataRoute } from "next";

import {
  getCategoryPageBySlug,
  getFeaturedCollections,
  getFirstCategories,
  getNestedCategoryPageByPath,
  getWordSearchThemes,
  type ChildCategory,
  type FirstCategory,
} from "@/lib/d1";
import { SITE_ORIGIN } from "@/lib/site-seo";
import { getActivePuzzleFamilies, getActivePuzzlePageDefinitions, isStaticPuzzleCategoryActive } from "@/lib/puzzle-static-data";
import { isStaticToolPageActive } from "@/lib/tool-static-data";

/**
 * 动态 sitemap：
 * - 跟着 ISR revalidate（1 小时）刷新一次
 * - admin 改动类目后，最多 1 小时新链接就出现在 sitemap 里，不用 redeploy
 * - 列出一/二/三级类目；三级素材页数量多，直接进入 sitemap 能提升发现效率
 */
export const revalidate = 3600;

const STATIC_PATHS = [
  "/",
  "/about",
  "/for-parents",
  "/for-teachers",
  "/how-to-print",
  "/collections",
  "/create",
  ...(isStaticToolPageActive("maze-generator") ? ["/tools/maze-generator"] : []),
  ...(isStaticToolPageActive("sudoku-generator") ? ["/tools/sudoku-generator"] : []),
  ...(isStaticToolPageActive("word-search-generator") ? ["/tools/word-search-generator"] : []),
  ...(isStaticPuzzleCategoryActive("puzzles") ? ["/puzzles"] : []),
  ...getActivePuzzleFamilies().map((family) => `/puzzles/${family.slug}`),
  ...getActivePuzzlePageDefinitions().map((page) => `/puzzles/${page.family}/${page.slug}`),
  "/privacy",
  "/terms",
];

// The generator tools are primary landing pages, so they outrank generic static pages.
const STATIC_PATH_PRIORITY: Record<string, number> = {
  "/": 1.0,
  "/tools/maze-generator": 0.8,
  "/tools/sudoku-generator": 0.8,
  "/tools/word-search-generator": 0.8,
  "/create": 0.7,
};

type SitemapCategory = Pick<
  FirstCategory | ChildCategory,
  "coverImageUrl" | "coverImageUrl512" | "seoImageUrl"
>;

function getCategoryImages(
  category: SitemapCategory | null | undefined,
  absoluteUrl: (path: string) => string,
) {
  if (!category) {
    return undefined;
  }

  const image =
    category.seoImageUrl ?? category.coverImageUrl ?? category.coverImageUrl512;

  if (!image) {
    return undefined;
  }

  return [/^https?:\/\//i.test(image) ? image : absoluteUrl(image)];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const today = new Date();
  const origin = SITE_ORIGIN.replace(/\/+$/, "");
  const url = (path: string) => `${origin}${path === "/" ? "" : path}`;
  const categoryEntry = (
    path: string,
    priority: number,
    category?: SitemapCategory | null,
  ): MetadataRoute.Sitemap[number] => ({
    url: url(path),
    lastModified: today,
    changeFrequency: "weekly",
    priority,
    images: getCategoryImages(category, url),
  });

  const entries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: url(path),
    lastModified: today,
    changeFrequency: "weekly",
    priority: STATIC_PATH_PRIORITY[path] ?? 0.5,
  }));

  let firsts: FirstCategory[] = [];
  try {
    firsts = await getFirstCategories();
  } catch {
    // 构建期 D1 不可达时不阻塞 sitemap 生成
    return entries;
  }

  for (const first of firsts) {
    entries.push(categoryEntry(`/${first.slug}`, 0.8, first));
  }

  // 并行拉取每个一级下的二级
  const seconds = await Promise.all(
    firsts.map((first) =>
      getCategoryPageBySlug(first.slug)
        .then((page) => ({ firstSlug: first.slug, children: page.data }))
        .catch(() => ({
          firstSlug: first.slug,
          children: [] as ChildCategory[],
        })),
    ),
  );

  for (const { firstSlug, children } of seconds) {
    for (const second of children) {
      entries.push(categoryEntry(`/${firstSlug}/${second.slug}`, 0.7, second));
    }
  }

  // 三级页面是具体素材主题页，数量更多，但 SEO 价值最高，也附带主图给 Google 发现。
  const thirds = await Promise.all(
    seconds.flatMap(({ firstSlug, children }) =>
      children.map((second) =>
        getNestedCategoryPageByPath(firstSlug, second.slug)
          .then((page) => ({
            firstSlug,
            secondSlug: second.slug,
            children: page.data,
          }))
          .catch(() => ({
            firstSlug,
            secondSlug: second.slug,
            children: [] as ChildCategory[],
          })),
      ),
    ),
  );

  for (const { firstSlug, secondSlug, children } of thirds) {
    for (const third of children) {
      entries.push(
        categoryEntry(
          `/${firstSlug}/${secondSlug}/${third.slug}`,
          0.6,
          third,
        ),
      );
    }
  }

  try {
    if (isStaticToolPageActive("word-search-generator")) {
      const wordSearchThemes = await getWordSearchThemes();
      for (const theme of wordSearchThemes) entries.push({
        url: url(`/tools/word-search-generator/${theme.slug}`),
        lastModified: today, changeFrequency: "weekly", priority: 0.65,
      });
    }

    const collections = await getFeaturedCollections(100);
    for (const collection of collections) {
      entries.push({
        url: url(`/collections/${collection.slug}`),
        lastModified: today,
        changeFrequency: "weekly",
        priority: 0.65,
        images: collection.heroImageUrl
          ? [
              /^https?:\/\//i.test(collection.heroImageUrl)
                ? collection.heroImageUrl
                : url(collection.heroImageUrl),
            ]
          : undefined,
      });
    }
  } catch {
    // 专题页不可用时，不影响分类 sitemap。
  }

  return entries;
}
