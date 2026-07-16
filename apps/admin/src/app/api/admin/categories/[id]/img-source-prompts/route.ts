import { NextResponse } from "next/server";

import { syncCategoryPosePromptImgSources, type ImgSourcePromptPlanInput } from "@/lib/admin-db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const categoryId = Number(id);
    const body = (await request.json()) as {
      items?: ImgSourcePromptPlanInput[];
      replace_existing?: boolean;
    };

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return NextResponse.json({ error: "分类 id 无效。" }, { status: 400 });
    }

    const items = Array.isArray(body.items) ? body.items : [];
    const result = await syncCategoryPosePromptImgSources(categoryId, items, {
      replaceExisting: body.replace_existing === true,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "保存原始图提示词失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
