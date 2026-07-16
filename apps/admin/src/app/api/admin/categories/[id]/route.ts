import { NextResponse } from "next/server";

import { deleteCategory, getCategoryById, updateCategory } from "@/lib/admin-db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const item = await getCategoryById(Number(id));

  if (!item) {
    return NextResponse.json({ error: "分类不存在。" }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      parent_id?: number | null;
      name?: string;
      slug?: string;
      description?: string | null;
      name_zh?: string | null;
      pose_prompt_specs?: string | null;
      cover_image?: string | null;
      seo_image_url?: string | null;
      sort_order?: number;
      is_active?: boolean;
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "分类名称不能为空。" }, { status: 400 });
    }

    const item = await updateCategory(Number(id), {
      parent_id: body.parent_id ?? null,
      name: body.name,
      slug: body.slug,
      description: body.description ?? null,
      name_zh: body.name_zh,
      pose_prompt_specs: body.pose_prompt_specs,
      cover_image: body.cover_image,
      seo_image_url: body.seo_image_url,
      sort_order: Number(body.sort_order ?? 0),
      is_active: body.is_active ?? true,
    });

    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新分类失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deleteCategory(Number(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除分类失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
