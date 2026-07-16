import { NextResponse } from "next/server";

import { createCategory, listCategories } from "@/lib/admin-db";

export async function GET() {
  try {
    return NextResponse.json(await listCategories());
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取分类失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
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

    const item = await createCategory({
      parent_id: body.parent_id ?? null,
      name: body.name,
      slug: body.slug,
      description: body.description ?? null,
      name_zh: body.name_zh,
      pose_prompt_specs: body.pose_prompt_specs ?? null,
      cover_image: body.cover_image ?? null,
      seo_image_url: body.seo_image_url ?? null,
      sort_order: Number(body.sort_order ?? 0),
      is_active: body.is_active ?? true,
    });

    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建分类失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
