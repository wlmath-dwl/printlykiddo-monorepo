import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import { CategoryCardGrid } from "@/components/category-card-grid";
import { JsonLd } from "@/components/json-ld";
import { SiteHeader } from "@/components/site-header";
import { WorksheetResourcePage } from "@/components/worksheet-resource-page";
import {
  resolveActiveFromBrowseSegment,
  resolveCategoryRoute,
} from "@/lib/category-route";
import type { ResolvedCategoryRoute } from "@/lib/category-route";
import {
  getActives,
  getCategoryPageBySlug,
  type CategoryPageData,
  getFirstCategories,
  getImgsByCategoryActiveBatch,
  getImgsFromBatch,
  getNestedCategoryPageByPath,
  getSpecialPageBySlug,
  getThirdLevelCategoryPage,
  type ActiveSummary,
  type ImgSummary,
} from "@/lib/d1";
import { buildCategoryPageSchemas } from "@/lib/seo-schema";
import { SITE_BRAND_NAME, SITE_DOMAIN_LABEL } from "@/lib/site-seo";
import { buildSiteNavItems } from "@/lib/site-nav";
import {
  getActivePuzzleFamilies,
  getActivePuzzlePageDefinitions,
  getStaticPuzzleActivityGroups,
  isStaticPuzzleCategoryActive,
} from "@/lib/puzzle-static-data";

/**
 * 改为 ISR：HTML 由 CDN 缓存，避免每次访问都打 D1。
 * 兄弟 topic 与 PDF 下载所需的图片清单改成在客户端打开 Modal 时按需 fetch。
 */
export const revalidate = 3600;

/**
 * 预渲染：build 时把所有一级、二级、三级类目页 HTML 直接打出。
 * 这样搜索引擎和用户首次访问三级资源页时，不必先等 Worker 现场生成。
 */
export async function generateStaticParams(): Promise<Array<{ slug: string[] }>> {
  const puzzleParams = [
    ...(isStaticPuzzleCategoryActive("puzzles") ? [{ slug: ["puzzles"] }] : []),
    ...getActivePuzzleFamilies().map((family) => ({ slug: ["puzzles", family.slug] })),
    ...getActivePuzzlePageDefinitions().map((page) => ({ slug: ["puzzles", page.family, page.slug] })),
  ];
  try {
    const firsts = await getFirstCategories();
    const params: Array<{ slug: string[] }> = firsts
      .filter((first) => first.slug !== "puzzles")
      .map((first) => ({
      slug: [first.slug],
      }));

    // 并行获取每个一级下的二级清单
    const firstPages = await Promise.all(
      firsts.map((first) =>
        getCategoryPageBySlug(first.slug)
          .then((page) => ({ firstSlug: first.slug, children: page.data }))
          .catch(() => ({ firstSlug: first.slug, children: [] as Array<{ slug: string }> })),
      ),
    );

    for (const { firstSlug, children } of firstPages) {
      for (const second of children) {
        params.push({ slug: [firstSlug, second.slug] });
      }
    }

    const secondPages = await Promise.all(
      firstPages.flatMap(({ firstSlug, children }) =>
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
              children: [] as Array<{ slug: string }>,
            })),
        ),
      ),
    );

    for (const { firstSlug, secondSlug, children } of secondPages) {
      for (const third of children) {
        params.push({ slug: [firstSlug, secondSlug, third.slug] });
      }
    }

    return [...params, ...puzzleParams];
  } catch {
    // 普通类目 D1 不可达时，固定益智页仍然可以完全依赖本地快照构建。
    return puzzleParams;
  }
}

type CategoryPageProps = {
  params: Promise<{
    slug: string[];
  }>;
  searchParams?: Promise<{
    tone?: string | string[];
  }>;
};

type CategoryPageCopyInput = {
  currentTitle: string;
  parentTitle?: string | null;
  rootSlug?: string | null;
  manualDescription?: string | null;
  selectedActive?: ActiveSummary | null;
  activityNames: string[];
  childCategoryNames: string[];
  categoryDepth: number;
  isTopLevel: boolean;
};

function getBrowseDisplayName({
  selectedActive,
}: Pick<CategoryPageCopyInput, "selectedActive">) {
  return selectedActive?.name ?? "";
}

function buildActivityHeading(currentTitle: string, activeName: string) {
  const normalizedActiveName = activeName.trim();
  const suffixPattern = /\b(?:pages|worksheets|puzzles|printables)\b/i;
  const suffix = suffixPattern.test(normalizedActiveName) ? "" : " Printables";
  return `${sentenceCaseTitle(currentTitle)} ${normalizedActiveName}${suffix}`;
}

/** H1 用：首字母大写，其余保持库里的拼写 */
function sentenceCaseTitle(value: string) {
  const t = value.trim();
  if (!t) {
    return t;
  }
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function normalizeCopy(value?: string | null) {
  const text = value?.trim();
  return text ? text : null;
}

function joinNaturalList(values: string[]) {
  if (values.length === 0) {
    return "";
  }
  if (values.length === 1) {
    return values[0] ?? "";
  }
  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function normalizeActivityPhraseName(name: string) {
  const normalized = name.trim().toLowerCase();
  const phraseByName: Record<string, string> = {
    coloring: "coloring pages",
    tracing: "tracing worksheets",
    "scissor skills": "scissor skills worksheets",
  };

  return phraseByName[normalized] ?? normalized;
}

function buildActivityPhrase(activityNames: string[]) {
  const normalized = [...new Set(
    activityNames
      .map((item) => normalizeActivityPhraseName(item))
      .filter(Boolean),
  )].slice(0, 5);

  return joinNaturalList(normalized);
}

function buildActivityTopicList(activityNames: string[]) {
  const phrase = buildActivityPhrase(activityNames);
  return phrase || "coloring pages, tracing worksheets, scissor skills pages, number activities, and printable puzzles";
}

function isPuzzleRoot(rootSlug?: string | null) {
  return rootSlug === "puzzles";
}

function buildPuzzleResourceHeading(currentTitle: string) {
  if (/\bsudoku\b/i.test(currentTitle)) {
    return `Free Printable ${sentenceCaseTitle(currentTitle)} Worksheets`;
  }
  return `${sentenceCaseTitle(currentTitle)} Printables`;
}

function buildResourcePageHeading(
  currentTitle: string,
  activityNames: string[],
  rootSlug?: string | null,
) {
  if (isPuzzleRoot(rootSlug)) {
    return buildPuzzleResourceHeading(currentTitle);
  }

  return `Free ${sentenceCaseTitle(currentTitle)} Printable Activities for Kids`;
}

function buildResourcePageTitle(
  currentTitle: string,
  rootSlug?: string | null,
) {
  if (isPuzzleRoot(rootSlug)) {
    return buildPuzzleResourceHeading(currentTitle);
  }

  return `Free ${sentenceCaseTitle(currentTitle)} Printables & Activity Pages for Kids`;
}

function buildTopicPhrase(names: string[], limit = 5) {
  const normalized = [...new Set(
    names
      .map((item) => sentenceCaseTitle(item.trim()))
      .filter(Boolean),
  )].slice(0, limit);

  if (normalized.length === 0) {
    return "";
  }

  if (names.length > limit) {
    return `${normalized.join(", ")}, and more`;
  }

  return joinNaturalList(normalized);
}

function buildCategoryPageCopy({
  currentTitle,
  parentTitle,
  rootSlug,
  manualDescription,
  selectedActive,
  activityNames,
  childCategoryNames,
  categoryDepth,
  isTopLevel,
}: CategoryPageCopyInput) {
  let metaDescription = "";
  const manualIntro = normalizeCopy(manualDescription);
  const browseDisplayName = getBrowseDisplayName({ selectedActive });
  const childTopicPhrase = buildTopicPhrase(childCategoryNames);

  if (selectedActive) {
    const metaTitle = parentTitle
      ? `${currentTitle} ${browseDisplayName} to Print · ${parentTitle} | ${SITE_DOMAIN_LABEL}`
      : `${currentTitle} ${browseDisplayName} to Print | ${SITE_DOMAIN_LABEL}`;

    metaDescription = manualIntro ?? (parentTitle
      ? `Download free ${currentTitle.toLowerCase()} ${browseDisplayName.toLowerCase()} in ${parentTitle}. Preview pages and print PDF activities for home, homeschool, or classroom use.`
      : `Download free ${currentTitle.toLowerCase()} ${browseDisplayName.toLowerCase()}. Preview pages and print PDF activities for home, homeschool, or classroom use.`);

    const heading = buildActivityHeading(currentTitle, selectedActive.name);
    const leadIntro = manualIntro ?? `Browse printable ${currentTitle.toLowerCase()} ${selectedActive.name.toLowerCase()} for home and classroom use. Download ready-to-print PDFs for parents, teachers, and caregivers.`;

    return {
      heading,
      leadIntro,
      metaTitle,
      metaDescription,
    };
  }

  if (isTopLevel) {
    if (isPuzzleRoot(rootSlug)) {
      const metaTitle = `${currentTitle} Printables & Puzzle Worksheets | ${SITE_DOMAIN_LABEL}`;
      const fallbackDescription = childTopicPhrase
        ? `Browse free printable puzzle worksheets, including ${childTopicPhrase} topics. Download PDF puzzles for kids, classroom centers, homeschool practice, and quiet-time activities.`
        : `Browse free printable puzzle worksheets for kids. Download Sudoku, mazes, logic puzzles, and PDF activities for home, homeschool, or classroom use.`;
      metaDescription = manualIntro ?? fallbackDescription;

      return {
        heading: `${currentTitle} Printables`,
        leadIntro: metaDescription,
        metaTitle,
        metaDescription,
      };
    }

    const metaTitle = `${currentTitle} Printables, Coloring Pages & Worksheets | ${SITE_DOMAIN_LABEL}`;
    const fallbackDescription = childTopicPhrase
      ? `Browse free ${currentTitle.toLowerCase()} printables, including ${childTopicPhrase} topics. Preview coloring pages, worksheets, and PDF activities for home or classroom use.`
      : `Browse free ${currentTitle.toLowerCase()} printables, coloring pages, worksheets, and PDF activities for home, classroom, and homeschool use.`;
    metaDescription = manualIntro ?? fallbackDescription;

    return {
      heading: `${currentTitle} Printables`,
      leadIntro: manualIntro ?? fallbackDescription,
      metaTitle,
      metaDescription,
    };
  }

  if (categoryDepth === 2) {
    if (isPuzzleRoot(rootSlug)) {
      const metaTitle = `${currentTitle} Printables & Puzzle Worksheets · ${parentTitle ?? SITE_DOMAIN_LABEL}`;
      const fallbackDescription = childTopicPhrase
        ? `Browse free printable ${currentTitle.toLowerCase()} worksheets, including ${childTopicPhrase} pages. Download PDF puzzles for kids, early learners, and classroom practice.`
        : `Browse free printable ${currentTitle.toLowerCase()} worksheets for kids. Download PDF puzzle pages for home, homeschool, and classroom practice.`;
      metaDescription = manualIntro ?? fallbackDescription;

      return {
        heading: `${sentenceCaseTitle(currentTitle)} Printables`,
        leadIntro: metaDescription,
        metaTitle: parentTitle
          ? `${currentTitle} Printables & Puzzle Worksheets · ${parentTitle} | ${SITE_DOMAIN_LABEL}`
          : `${currentTitle} Printables & Puzzle Worksheets | ${SITE_DOMAIN_LABEL}`,
        metaDescription,
      };
    }

    const metaTitle = parentTitle
      ? `${currentTitle} Printables, Coloring Pages & Worksheets · ${parentTitle} | ${SITE_DOMAIN_LABEL}`
      : `${currentTitle} Printables, Coloring Pages & Worksheets | ${SITE_DOMAIN_LABEL}`;
    const fallbackDescription = childTopicPhrase
      ? `Browse free ${currentTitle.toLowerCase()} printables, including ${childTopicPhrase} topic pages. Preview coloring pages, worksheets, and ready-to-print PDFs.`
      : `Browse free ${currentTitle.toLowerCase()} printables, coloring pages, worksheets, and ready-to-print PDFs for home and classroom use.`;

    metaDescription = manualIntro ?? fallbackDescription;

    return {
      heading: `${sentenceCaseTitle(currentTitle)} Printables`,
      leadIntro: metaDescription,
      metaTitle,
      metaDescription,
    };
  }

  if (categoryDepth >= 3) {
    const resourceHeading = buildResourcePageHeading(
      currentTitle,
      activityNames,
      rootSlug,
    );
    const activityTopicList = buildActivityTopicList(activityNames);
    const resourceTitle = buildResourcePageTitle(currentTitle, rootSlug);
    const metaTitle = `${resourceTitle} | ${SITE_BRAND_NAME}`;

    metaDescription = manualIntro ?? (isPuzzleRoot(rootSlug)
      ? `Download free printable ${currentTitle.toLowerCase()} worksheets for kids. Print beginner-friendly PDF puzzles with optional answer keys for home, homeschool, and classroom practice.`
      : `Browse free ${currentTitle.toLowerCase()} printables for kids, including ${activityTopicList}. Preview the activities, choose a paper size and page layout, then download or print a PDF for home, preschool, kindergarten, or classroom use.`);

    return {
      heading: resourceHeading,
      leadIntro: metaDescription,
      metaTitle,
      metaDescription,
    };
  }

  const metaTitle = parentTitle
    ? `${currentTitle} Printables for Parents & Teachers · ${parentTitle} | ${SITE_DOMAIN_LABEL}`
    : `${currentTitle} Printables for Parents & Teachers | ${SITE_DOMAIN_LABEL}`;

  metaDescription = manualIntro ?? (parentTitle
    ? `Browse printable ${currentTitle.toLowerCase()} resources in ${parentTitle} for home and classroom use. Download ready-to-print PDFs for parents, teachers, and caregivers.`
    : `Browse printable ${currentTitle.toLowerCase()} resources for home and classroom use. Download ready-to-print PDFs for parents, teachers, and caregivers.`);

  return {
    heading: `${currentTitle} Printables`,
    leadIntro: metaDescription,
    metaTitle,
    metaDescription,
  };
}

type ResolvedCategoryData = {
  route: ResolvedCategoryRoute;
  categoryPage: CategoryPageData;
};

/** 按 activity 分组的图片 */
type ActivityImageGroup = {
  active: ActiveSummary;
  imgs: ImgSummary[];
};

type CategoryScreenData = {
  route: ResolvedCategoryRoute;
  categoryPage: CategoryPageData;
  currentCategory: NonNullable<CategoryPageData["current"]>;
  parentCategory: CategoryPageData["parent"];
  secondLevelCategory: CategoryPageData["secondLevel"];
  siblingCategories: CategoryPageData["data"];
  secondLevelSiblingCategories: CategoryPageData["data"];
  actives: ActiveSummary[];
  /** 按 activity 分组的所有图片（三级资源页使用） */
  activityGroups: ActivityImageGroup[];
  pageCopy: ReturnType<typeof buildCategoryPageCopy>;
  pageTitle: string;
  pageDescription: string;
  currentPath: string;
  breadcrumbs: Array<{ name: string; path: string }>;
};

function buildPdfFileName(options: {
  categorySegments: string[];
  activeSlug?: string | null;
  tone: "color" | "bw";
}) {
  const parts = [...options.categorySegments];
  if (options.activeSlug) {
    parts.push(options.activeSlug);
  }
  if (options.tone === "bw") {
    parts.push("bw");
  }
  return `${parts.join("-")}.pdf`;
}

function lowerDisplayName(value: string) {
  return value.trim().toLowerCase();
}

function titleDisplayName(value: string) {
  return sentenceCaseTitle(value.trim());
}

function buildActivityUsePhrase(activityNames: string[]) {
  const phrase = buildActivityPhrase(activityNames);
  return phrase || "coloring, tracing, cutting practice, and simple puzzle activities";
}

function getActivityIncludedLabel(slug: string, name: string) {
  const labelBySlug: Record<string, string> = {
    "coloring-pages": "coloring pages",
    "tracing-worksheets": "tracing worksheets",
    cut: "scissor skills worksheets",
    "number-sequencing": "number sequence puzzles",
    "grid-puzzles": "grid puzzles",
  };

  return labelBySlug[slug] ?? name.trim().toLowerCase();
}

function buildPageContentSections(options: {
  currentTitle: string;
  parentTitle?: string | null;
  secondLevelTitle?: string | null;
  rootSlug?: string | null;
  manualDescription?: string | null;
  categoryDepth: number;
  childCount: number;
  childCategoryNames: string[];
  resourceCount: number;
  activityNames: string[];
  activityCounts: Array<{ name: string; slug: string; count: number }>;
  currentPath: string;
}) {
  const topic = lowerDisplayName(options.currentTitle);
  const topicTitle = titleDisplayName(options.currentTitle);
  const activityPhrase = buildActivityUsePhrase(options.activityNames);
  const childTopicPhrase = buildTopicPhrase(options.childCategoryNames);
  const isResourcePage = options.categoryDepth >= 3;
  const manualIntro = normalizeCopy(options.manualDescription);
  const isBlankGridPage =
    options.currentPath === "/puzzles/blank-grids" ||
    options.currentPath.startsWith("/puzzles/blank-grids/");

  if (isResourcePage) {
    if (isBlankGridPage) {
      return {
        intro: manualIntro ?? `Download free printable ${topic} templates. Preview the grid pages, choose a PDF layout, and print them for math practice, puzzle making, classroom centers, or planning activities.`,
        includedItems: [
          `${options.resourceCount || "Ready-to-print"} ${topicTitle} templates that can be downloaded as a PDF.`,
          "Simple blank grid formats for math practice, puzzle creation, graphing, and classroom activities.",
          "Low-ink black-and-white pages designed for quick home or classroom printing.",
        ],
        useItems: [
          "Use one-per-page layout when students need larger writing spaces.",
          "Use two-per-page or four-per-page layouts for quick practice, notebooks, or classroom packets.",
          "Print extra blank grids for number work, graphing tasks, puzzle drafts, or reusable lesson materials.",
        ],
      };
    }

    if (isPuzzleRoot(options.rootSlug)) {
      return {
        intro: manualIntro ?? `Download free printable ${topic} worksheets for kids. Preview the puzzle pages, choose a PDF layout, and print them for home practice, homeschool lessons, classroom centers, or quiet-time activities.`,
        includedItems: [
          `${options.resourceCount || "Ready-to-print"} ${topicTitle} puzzle worksheets that can be downloaded as a PDF.`,
          "Optional answer keys for parents and teachers when building printable puzzle packs.",
          "Simple black-and-white formats for low-ink classroom and home printing.",
        ],
        useItems: [
          "Use four-per-page layout for short daily practice or worksheet packets.",
          "Use one-per-page layout when younger children need larger writing spaces.",
          "Print answer keys separately when you want a quick check sheet for parents or teachers.",
        ],
      };
    }

    const includedItems = options.activityCounts
      .filter((item) => item.count > 0)
      .map((item) => {
        const label = getActivityIncludedLabel(item.slug, item.name);
        return `${item.count} ${topic} ${label}`;
      });

    return {
      intro: manualIntro ?? `Browse free ${topic} printables for kids, including ${activityPhrase}. Preview the activities, choose a paper size and page layout, then download or print a PDF for home, preschool, kindergarten, or classroom use.`,
      includedItems: [
        ...includedItems,
        `${options.resourceCount || "Ready-to-print"} printable activity pages in total.`,
        "Simple printable formats for home practice, small groups, classroom centers, and take-home packets.",
      ],
      useItems: [
        "Choose full-page layout for coloring sheets and display pages.",
        "Use two-per-page layout when you want smaller practice sheets or packet inserts.",
        "Print on Letter or A4 paper, then use the pages for quiet work, centers, homeschool practice, or take-home activities.",
      ],
    };
  }

  return {
    intro: manualIntro ?? (childTopicPhrase
      ? `Browse free ${topic} printables organized into ${childTopicPhrase} topics. Parents and teachers can choose a subcategory, preview matching pages, and download ready-to-print PDFs for home or classroom use.`
      : `Browse free ${topic} printables organized for home and classroom use. Parents and teachers can choose a topic, preview matching pages, and download ready-to-print PDFs.`),
    includedItems: [
      `${options.childCount || "Multiple"} topic pages linked from this ${topic} category.`,
      `Printable formats for ${activityPhrase} on the matching resource pages.`,
      "Category paths that make it easier to move from a broad topic to a specific printable set.",
    ],
    useItems: [
      "Start with a topic card above, then open a specific printable set.",
      "Use the PDF controls on resource pages to choose full-page or two-per-page printing.",
      "Pair related categories when planning a classroom theme, home practice session, or activity packet.",
    ],
  };
}

function getRelatedLinkLabel(title: string) {
  return `${titleDisplayName(title)} printables`;
}

async function getResolvedCategoryData(
  slugParts: string[],
): Promise<ResolvedCategoryData | null> {
  if (slugParts.length === 1) {
    return {
      route: resolveCategoryRoute(slugParts, false)!,
      categoryPage: await getCategoryPageBySlug(slugParts[0]),
    };
  }

  if (slugParts.length === 2) {
    return {
      route: resolveCategoryRoute(slugParts, false)!,
      categoryPage: await getNestedCategoryPageByPath(
        slugParts[0],
        slugParts[1],
      ),
    };
  }

  if (slugParts.length === 3) {
    const thirdLevelPage = await getThirdLevelCategoryPage(
      slugParts[0],
      slugParts[1],
      slugParts[2],
    );
    const route = resolveCategoryRoute(
      slugParts,
      Boolean(thirdLevelPage.current),
    );
    if (!route) {
      return null;
    }

    if (route.categoryDepth === 3) {
      return {
        route,
        categoryPage: thirdLevelPage,
      };
    }

    return {
      route,
      categoryPage: await getNestedCategoryPageByPath(
        slugParts[0],
        slugParts[1],
      ),
    };
  }

  if (slugParts.length === 4) {
    const route = resolveCategoryRoute(slugParts, false);
    if (!route) {
      return null;
    }

    return {
      route,
      categoryPage: await getThirdLevelCategoryPage(
        slugParts[0],
        slugParts[1],
        slugParts[2],
      ),
    };
  }

  return null;
}

async function loadCategoryScreenData(
  slugPath: string,
): Promise<CategoryScreenData | null> {
    const slug = slugPath.split("/").filter(Boolean);
    const resolved = await getResolvedCategoryData(slug);
    if (!resolved?.categoryPage.current) {
      return null;
    }

    const { categoryPage, route } = resolved;
    const currentCategory = categoryPage.current;
    if (!currentCategory) {
      return null;
    }
    const parentCategory = categoryPage.parent;
    const secondLevelCategory = categoryPage.secondLevel;

    // 三级资源页展示所有 activity，并在下载弹框内支持同二级下的其他三级 topic。
    const isResourcePage = route.categoryDepth >= 3;
    const isStaticPuzzleResource = isResourcePage && route.categorySegments[0] === "puzzles";
    const staticPuzzleGroups = isStaticPuzzleResource
      ? getStaticPuzzleActivityGroups(currentCategory.slug)
      : [];
    const actives = isStaticPuzzleResource
      ? staticPuzzleGroups.map((group) => group.active)
      : isResourcePage ? await getActives() : [];

    // 如果 URL 带了 browse 段（旧链接），验证其有效性后重定向到基础路径
    if (route.browseSegment) {
      const matchedActive = resolveActiveFromBrowseSegment(route.browseSegment, actives);
      if (!matchedActive) {
        return null;
      }
      // 旧 browse 段 URL 仍然有效，但现在页面显示所有 activity
    }

    // 获取所有 activity 的图片，按分组返回
    const activityGroups: ActivityImageGroup[] = [...staticPuzzleGroups];
    if (isResourcePage && !isStaticPuzzleResource && actives.length > 0) {
      // 一次 IN 查询拉回当前 topic 在所有 active 下的图片
      const imgsBatch = await getImgsByCategoryActiveBatch({
        categoryIds: [currentCategory.id],
        activeIds: actives.map((a) => a.id),
      });
      for (const active of actives) {
        const imgs = getImgsFromBatch(imgsBatch, currentCategory.id, active.id);
        if (imgs.length > 0) {
          activityGroups.push({ active, imgs });
        }
      }
    }

    let siblingCategories: CategoryPageData["data"] = [];
    if (isResourcePage && parentCategory && secondLevelCategory) {
      const siblingPage = await getNestedCategoryPageByPath(
        parentCategory.slug,
        secondLevelCategory.slug,
      );
      siblingCategories = siblingPage.data.filter(
        (item) => item.id !== currentCategory.id,
      );
    }

    let secondLevelSiblingCategories: CategoryPageData["data"] = [];
    if (route.categoryDepth === 2 && parentCategory) {
      const parentPage = await getCategoryPageBySlug(parentCategory.slug);
      secondLevelSiblingCategories = parentPage.data.filter(
        (item) => item.id !== currentCategory.id,
      );
    }

    const pageCopy = buildCategoryPageCopy({
      currentTitle: currentCategory.title,
      parentTitle: parentCategory?.title,
      rootSlug: route.categorySegments[0] ?? currentCategory.slug,
      manualDescription: currentCategory.manualDescription,
      selectedActive: null,
      activityNames: actives.map((item) => item.name),
      childCategoryNames: categoryPage.data.map((item) => item.title),
      categoryDepth: route.categoryDepth,
      isTopLevel: !parentCategory,
    });
    const pageTitle = pageCopy.heading;
    const pageDescription = pageCopy.metaDescription;
    const currentPath = `/${route.categorySegments.join("/")}`;

    // 视觉 breadcrumb：所有分类页都从 Home 开始，不含活动/标签段
    const breadcrumbs: Array<{ name: string; path: string }> = [];
    breadcrumbs.push({
      name: "Home",
      path: "/",
    });
    if (parentCategory) {
      breadcrumbs.push({
        name: parentCategory.title,
        path: `/${parentCategory.slug}`,
      });
    }
    if (secondLevelCategory && parentCategory) {
      breadcrumbs.push({
        name: secondLevelCategory.title,
        path: `/${parentCategory.slug}/${secondLevelCategory.slug}`,
      });
    }
    breadcrumbs.push({
      name: currentCategory.title,
      path: `/${route.categorySegments.join("/")}`,
    });

    return {
      route,
      categoryPage,
      currentCategory,
      parentCategory,
      secondLevelCategory,
      siblingCategories,
      secondLevelSiblingCategories,
      actives,
      activityGroups,
      pageCopy,
      pageTitle,
      pageDescription,
      currentPath,
      breadcrumbs,
    };
}

const getCategoryScreenDataCached = cache(loadCategoryScreenData);

function getCategoryScreenData(slugPath: string) {
  if (process.env.NODE_ENV === "development") {
    return loadCategoryScreenData(slugPath);
  }

  return getCategoryScreenDataCached(slugPath);
}

function getSpecialPage(slug: string) {
  return getSpecialPageBySlug(slug);
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  if (slug.length === 1) {
    const specialPage = await getSpecialPage(slug[0] ?? "");
    if (specialPage) {
      return {
        title: specialPage.seoTitle || `${specialPage.title} | ${SITE_DOMAIN_LABEL}`,
        description:
          specialPage.seoDescription ||
          specialPage.description ||
          specialPage.subtitle ||
          "Browse this printable collection.",
        alternates: {
          canonical: `/collections/${specialPage.slug}`,
        },
        openGraph: {
          title: specialPage.seoTitle || `${specialPage.title} | ${SITE_DOMAIN_LABEL}`,
          description:
            specialPage.seoDescription ||
            specialPage.description ||
            specialPage.subtitle ||
            "Browse this printable collection.",
          url: `/collections/${specialPage.slug}`,
          images: specialPage.heroImageUrl
            ? [
                {
                  url: specialPage.heroImageUrl,
                  width: 1024,
                  height: 1024,
                  alt: `${specialPage.title} preview`,
                },
              ]
            : undefined,
        },
      };
    }
  }

  const screenData = await getCategoryScreenData(slug.join("/"));

  if (!screenData) {
    return {
      title: `Category not found | ${SITE_DOMAIN_LABEL}`,
      description: "The requested category could not be found.",
    };
  }

  const socialImage = screenData.currentCategory.seoImageUrl ?? undefined;

  return {
    title: screenData.pageCopy.metaTitle,
    description: screenData.pageCopy.metaDescription,
    alternates: {
      canonical: screenData.currentPath,
    },
    openGraph: {
      title: screenData.pageCopy.metaTitle,
      description: screenData.pageCopy.metaDescription,
      url: screenData.currentPath,
      images: socialImage
        ? [
            {
              url: socialImage,
              width: 1024,
              height: 1024,
              alt: `${screenData.currentCategory.title} printables preview`,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: screenData.pageCopy.metaTitle,
      description: screenData.pageCopy.metaDescription,
      images: socialImage ? [socialImage] : undefined,
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: CategoryPageProps) {
  const { slug } = await params;
  const firstCategoriesPromise = getFirstCategories();
  const specialPagePromise =
    slug.length === 1 ? getSpecialPage(slug[0] ?? "") : Promise.resolve(null);
  const screenDataPromise = getCategoryScreenData(slug.join("/"));
  const [firstCategories, specialPage, screenData] = await Promise.all([
    firstCategoriesPromise,
    specialPagePromise,
    screenDataPromise,
  ]);

  if (specialPage) {
    redirect(`/collections/${specialPage.slug}`);
  }

  if (!screenData) {
    notFound();
  }

  const {
    categoryPage,
    route,
    currentCategory,
    parentCategory,
    secondLevelCategory,
    siblingCategories,
    secondLevelSiblingCategories,
    activityGroups,
    pageTitle,
    pageDescription,
    currentPath,
    breadcrumbs,
  } = screenData;

  // 旧的 browse 段 URL 重定向到基础分类路径
  if (route.browseSegment) {
    redirect(`/${route.categorySegments.join("/")}`);
  }

  if (slug.length === 1 && parentCategory) {
    redirect(`/${parentCategory.slug}/${currentCategory.slug}`);
  }

  const navItems = buildSiteNavItems(firstCategories);

  const categorySchemas = buildCategoryPageSchemas({
    path: currentPath,
    pageTitle,
    pageDescription,
    currentTitle: currentCategory.title,
    slugParts: slug,
    breadcrumbs,
    parentTitle: parentCategory?.title,
    secondLevelTitle: secondLevelCategory?.title,
    selectedActiveName: null,
    imageUrl: currentCategory.seoImageUrl,
  });

  const hasChildren = categoryPage.data.length > 0;
  const hasActivityGroups = activityGroups.length > 0;
  const activityNames = activityGroups.length
    ? activityGroups.map((group) => group.active.name)
    : screenData.actives.map((item) => item.name);
  const pdfFileName = buildPdfFileName({
    categorySegments: route.categorySegments,
    activeSlug: null,
    tone: "color",
  });
  const pageSections = buildPageContentSections({
    currentTitle: currentCategory.title,
    parentTitle: parentCategory?.title,
    secondLevelTitle: secondLevelCategory?.title,
    rootSlug: route.categorySegments[0],
    manualDescription: currentCategory.manualDescription,
    categoryDepth: route.categoryDepth,
    childCount: categoryPage.data.length,
    childCategoryNames: categoryPage.data.map((item) => item.title),
    resourceCount: activityGroups.reduce(
      (sum, group) => sum + group.imgs.length,
      0,
    ),
    activityNames,
    activityCounts: activityGroups.map((group) => ({
      name: group.active.name,
      slug: group.active.slug,
      count: group.imgs.length,
    })),
    currentPath,
  });
  const childHrefBuilder =
    route.categoryDepth === 1
      ? (category: (typeof categoryPage.data)[number]) =>
          `/${currentCategory.slug}/${category.slug}`
      : route.categoryDepth === 2
        ? (category: (typeof categoryPage.data)[number]) =>
            `/${route.categorySegments.join("/")}/${category.slug}`
        : undefined;
  const relatedLinks =
    route.categoryDepth >= 3 && parentCategory && secondLevelCategory
      ? [
          {
            label: getRelatedLinkLabel(secondLevelCategory.title),
            href: `/${parentCategory.slug}/${secondLevelCategory.slug}`,
          },
          {
            label: getRelatedLinkLabel(parentCategory.title),
            href: `/${parentCategory.slug}`,
          },
          ...siblingCategories.map((category) => ({
            label: getRelatedLinkLabel(category.title),
            href: `/${parentCategory.slug}/${secondLevelCategory.slug}/${category.slug}`,
          })),
        ]
      : [];
  const secondLevelSiblingLinks =
    route.categoryDepth === 2 && parentCategory
      ? secondLevelSiblingCategories.map((category) => ({
          label: getRelatedLinkLabel(category.title),
          href: `/${parentCategory.slug}/${category.slug}`,
        }))
      : [];
  const heroImageUrl =
    currentCategory.coverImageUrl512 ??
    currentCategory.coverImageUrl ??
    currentCategory.seoImageUrl;

  return (
    <main>
      <JsonLd data={categorySchemas} />

      <section className="w-full">
        <SiteHeader items={navItems} activePath={currentPath} subtle />
      </section>

      {/* 单列内容区 */}
      <section className="mx-auto max-w-6xl px-6 pb-10 pt-6 lg:px-10 lg:pb-12">
        <div className="w-full min-w-0 text-left">
          <nav
            className="mb-5 text-[13px] leading-snug text-[#8C8C8C]"
            aria-label="Breadcrumb"
          >
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <span key={`${crumb.path}-${index}`} className="inline">
                  {index > 0 ? (
                    <span className="px-2 text-[#8C8C8C]/50" aria-hidden>
                      /
                    </span>
                  ) : null}
                  {isLast ? (
                    <span className="text-warm-coffee/90">{crumb.name}</span>
                  ) : (
                    <Link
                      href={crumb.path}
                      className="transition hover:text-warm-coffee"
                    >
                      {crumb.name}
                    </Link>
                  )}
                </span>
              );
            })}
          </nav>

          <div
            className={
              heroImageUrl
                ? "grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_220px] lg:grid-cols-[minmax(0,1fr)_260px]"
                : "w-full max-w-3xl"
            }
          >
            <div className="w-full max-w-3xl">
              <h1 className="mb-2 mt-0 text-3xl font-semibold leading-[1.2] tracking-tight text-warm-ink">
                {pageTitle}
              </h1>
              <p className="mb-0 max-w-[68ch] text-sm leading-relaxed text-warm-ink/70">
                {pageSections.intro}
              </p>
            </div>
            {heroImageUrl ? (
              <div className="mx-auto grid aspect-square w-full max-w-[200px] place-items-center rounded-[14px] border border-[#EEE8DD] bg-white p-3.5 shadow-[0_12px_32px_rgba(59,53,44,0.06)] sm:max-w-[220px] md:mx-0 md:ml-auto lg:max-w-[260px]">
                <div className="relative h-full w-full">
                  <Image
                    src={heroImageUrl}
                    alt={`${currentCategory.title} printable preview`}
                    fill
                    sizes="(min-width: 1024px) 260px, (min-width: 640px) 220px, 200px"
                    priority
                    fetchPriority="high"
                    className="object-contain"
                  />
                </div>
              </div>
            ) : null}
          </div>

        </div>

        <section className="mt-6 md:mt-8">
          {hasActivityGroups ? (
            <WorksheetResourcePage
              fileName={pdfFileName}
              groups={activityGroups}
              deferInitialImages={Boolean(heroImageUrl)}
              initialTopicId={currentCategory.id}
              topicTitle={currentCategory.title}
              currentCategoryPath={currentPath.replace(/^\//, "")}
              downloadHistoryContext={{
                level1: parentCategory
                  ? {
                      id: String(parentCategory.id),
                      name: parentCategory.title,
                      slug: parentCategory.slug,
                    }
                  : null,
                level2: secondLevelCategory
                  ? {
                      id: String(secondLevelCategory.id),
                      name: secondLevelCategory.title,
                      slug: secondLevelCategory.slug,
                    }
                  : null,
                currentTopic: {
                  id: currentCategory.id,
                  slug: currentCategory.slug,
                  title: currentCategory.title,
                  url: currentPath,
                  thumbnail:
                    currentCategory.coverImageUrl512 ??
                    currentCategory.coverImageUrl ??
                    currentCategory.seoImageUrl,
                },
              }}
            />
          ) : hasChildren && route.categoryDepth < 3 ? (
            <>
              <h2 className="text-xl font-semibold tracking-tight text-warm-ink">
                Printable topics
              </h2>
              <CategoryCardGrid
                items={categoryPage.data}
                badgeLabel={currentCategory.title}
                hrefBuilder={childHrefBuilder}
                layout="directory"
                /**
                 * 有 hero 图时让 hero 抢 fetchPriority=high；
                 * 但首屏视口里的前几张子分类卡仍走 eager，避免逐张冒出。
                 */
                imagePriorityCount={heroImageUrl ? 4 : 6}
                firstImageIsLcpCandidate={!heroImageUrl}
                showDownloadedBadges={route.categoryDepth === 2}
              />
            </>
          ) : (
            <div className="mt-8 rounded-3xl border-0 bg-warm-card p-8 shadow-none">
              <p className="text-sm leading-7 text-charcoal/65">
                {route.categoryDepth === 3
                  ? "No printable images are available for this category yet."
                  : route.categoryDepth === 2
                    ? "This category does not have active third-level entries yet."
                    : "This category does not have active category entries yet."}
              </p>
            </div>
          )}
        </section>

        {secondLevelSiblingLinks.length > 0 && parentCategory ? (
          <section className="mt-12 border-t border-[#EEE8DD] pt-8">
            <h2 className="text-base font-semibold tracking-tight text-warm-ink">
              More in {parentCategory.title}
            </h2>
            <div className="mt-4 flex flex-wrap gap-2">
              {secondLevelSiblingLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-full border border-[#E8E2D8] bg-white px-3 py-1.5 text-sm font-medium text-warm-ink/65 transition hover:border-brand/70 hover:text-warm-ink"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {route.categoryDepth >= 3 ? (
          <section className="mt-12 border-t border-[#EEE8DD] pt-8">
            <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
              <section>
                <h2 className="text-xl font-semibold tracking-tight text-warm-ink">
                  What's included
                </h2>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-warm-ink/70">
                  {pageSections.includedItems.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h2 className="text-xl font-semibold tracking-tight text-warm-ink">
                  How to use these printables
                </h2>
                <ul className="mt-4 space-y-3 text-sm leading-6 text-warm-ink/70">
                  {pageSections.useItems.map((item) => (
                    <li key={item} className="flex gap-3">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            {relatedLinks.length > 0 ? (
              <section className="mt-10 border-t border-[#EEE8DD] pt-8">
                <h2 className="text-base font-semibold tracking-tight text-warm-ink">
                  More in {secondLevelCategory?.title ?? "this category"}
                </h2>
                <div className="mt-4 flex flex-wrap gap-2">
                  {relatedLinks.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="rounded-full border border-[#E8E2D8] bg-white px-3 py-1.5 text-sm font-medium text-warm-ink/65 transition hover:border-brand/70 hover:text-warm-ink"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </section>
        ) : null}
      </section>
    </main>
  );
}
