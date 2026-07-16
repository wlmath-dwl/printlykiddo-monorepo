import { NextResponse } from "next/server";

import {
  getActives,
  getImgsByCategoryActiveBatch,
  getImgsFromBatch,
  getNestedCategoryPageByPath,
  getThirdLevelCategoryPage,
} from "@/lib/d1";

export const runtime = "nodejs";

const BLACK_WHITE_PDF_ACTIVITY_SLUGS = new Set([
  "coloring-pages",
  "tracing-worksheets",
  "puzzle-worksheet",
]);

const ACTIVITY_LABEL_BY_SLUG: Record<string, string> = {
  "coloring-pages": "Coloring Pages",
  "tracing-worksheets": "Tracing Worksheets",
  cut: "Scissor Skills Worksheets",
  "number-sequencing": "Number Sequence Puzzles",
  "grid-puzzles": "Grid Puzzles",
  "puzzle-worksheet": "Puzzle Worksheets",
};

function getPdfTopicsResponseHeaders() {
  if (process.env.NODE_ENV === "development") {
    return {
      "Cache-Control": "no-store",
    };
  }

  return {
    "Cache-Control":
      "public, max-age=60, s-maxage=600, stale-while-revalidate=86400",
  };
}

function titleCase(value: string) {
  const text = value.trim();
  if (!text) {
    return text;
  }
  return text
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

/**
 * 资源页打开 PDF 弹框时按需请求：当前三级 topic + 同二级下其它 topic 的图片清单。
 * 让首屏 SSR 不再需要遍历兄弟分类 × actives × imgs，TTFB 更快。
 *
 * 实现要点：
 * - 类目结构（第三级 + 二级 + 兄弟）并行查
 * - 所有 topic × 所有 active 的图片用 1 次 IN 查询合并拉回（O(1) D1 RTT）
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path")?.trim().replace(/^\/+|\/+$/g, "");
  if (!path) {
    return NextResponse.json(
      { topics: [] },
      { headers: getPdfTopicsResponseHeaders() },
    );
  }

  const segments = path.split("/").filter(Boolean);
  if (segments.length < 3) {
    return NextResponse.json(
      { topics: [] },
      { headers: getPdfTopicsResponseHeaders() },
    );
  }

  const [parentSlug, secondSlug, thirdSlug] = segments;

  // 并行：当前三级页 / 全部 active / 兄弟列表
  const [thirdLevelPage, actives, siblingPage] = await Promise.all([
    getThirdLevelCategoryPage(parentSlug, secondSlug, thirdSlug),
    getActives(),
    getNestedCategoryPageByPath(parentSlug, secondSlug),
  ]);

  if (!thirdLevelPage.current) {
    return NextResponse.json(
      { topics: [] },
      { headers: getPdfTopicsResponseHeaders() },
    );
  }

  const siblings = siblingPage.data.filter(
    (item) => item.id !== thirdLevelPage.current?.id,
  );
  const allTopics = [thirdLevelPage.current, ...siblings];

  if (allTopics.length === 0 || actives.length === 0) {
    return NextResponse.json(
      { topics: [] },
      { headers: getPdfTopicsResponseHeaders() },
    );
  }

  // 一次 IN 查询拿回 N×M 组合的所有图片
  const imgsBatch = await getImgsByCategoryActiveBatch({
    categoryIds: allTopics.map((t) => t.id),
    activeIds: actives.map((a) => a.id),
  });

  const topics = allTopics
    .map((topic) => {
      const topicActivities = actives
        .map((active) => {
          const imgs = getImgsFromBatch(imgsBatch, topic.id, active.id);
          return {
            slug: active.slug,
            label: ACTIVITY_LABEL_BY_SLUG[active.slug] ?? titleCase(active.name),
            imageUrls: imgs.map((item) => item.imageUrl),
            items: imgs.map((item) => ({
              imageUrl: item.imageUrl,
              answerImageUrl: item.answerImageUrl,
              title: item.title,
              difficulty: item.difficulty,
            })),
            grayscale: BLACK_WHITE_PDF_ACTIVITY_SLUGS.has(active.slug),
          };
        })
        .filter((activity) => activity.imageUrls.length > 0);

      return {
        id: topic.id,
        slug: topic.slug,
        title: topic.title,
        coverImageUrl: topic.coverImageUrl,
        activities: topicActivities,
      };
    })
    .filter((item) => item.activities.length > 0);

  return NextResponse.json(
    { topics },
    { headers: getPdfTopicsResponseHeaders() },
  );
}
