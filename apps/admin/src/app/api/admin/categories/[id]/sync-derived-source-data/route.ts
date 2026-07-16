import { NextResponse } from "next/server";

import {
  getCategoryById,
  listCategories,
  syncCategoryPosePromptImgSources,
} from "@/lib/admin-db";
import type { CategoryRecord } from "@/lib/admin-types";
import { buildPromptPlansFromCategory } from "@/lib/pose-prompt-plan-builder";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const categoryId = Number(id);
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return NextResponse.json({ error: "分类 id 无效。" }, { status: 400 });
    }

    const category = await getCategoryById(categoryId);
    if (!category) {
      return NextResponse.json({ error: "分类不存在。" }, { status: 404 });
    }

    if (!category.pose_prompt_specs?.trim()) {
      return NextResponse.json({ error: "该分类没有姿态提示词数据。" }, { status: 400 });
    }

    const categories = await listCategories();
    const categoryMap = new Map(categories.flat.map((c: CategoryRecord) => [c.id, c]));

    const ancestors: string[] = [];
    let cursorId = category.parent_id;
    while (cursorId !== null) {
      const parent = categoryMap.get(cursorId);
      if (!parent) break;
      ancestors.unshift(parent.name);
      cursorId = parent.parent_id;
    }

    const plans = buildPromptPlansFromCategory(category.name, ancestors, category.pose_prompt_specs).filter(
      (plan) => plan.source_kind === "outline" || plan.source_kind === "scene_color",
    );

    const result = await syncCategoryPosePromptImgSources(categoryId, plans, { replaceExisting: false });

    return NextResponse.json({
      success: true,
      count: result.items.filter(
        (item) => item.source_kind === "outline" || item.source_kind === "scene_color",
      ).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "同步线框/背景原图数据失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
