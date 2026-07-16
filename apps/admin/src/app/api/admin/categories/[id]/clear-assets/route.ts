import { NextResponse } from "next/server";

import {
  clearCategoryGeneratedImgs,
  clearCategoryImgAssets,
  clearCategoryImgSources,
} from "@/lib/admin-db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const categoryId = Number(id);

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return NextResponse.json({ error: "分类 id 无效。" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      target?: "all" | "sources" | "generated_imgs";
    };
    const target = body.target ?? "all";
    const result =
      target === "sources"
        ? await clearCategoryImgSources(categoryId)
        : target === "generated_imgs"
          ? await clearCategoryGeneratedImgs(categoryId)
          : await clearCategoryImgAssets(categoryId);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "清空当前分类原始图和功能图失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
