import { NextResponse } from "next/server";

import { createImgSource, listAllImgSources, listImgSourcesByCategory } from "@/lib/admin-db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const fetchAll = searchParams.get("all");
    if (fetchAll === "1" || fetchAll === "true") {
      return NextResponse.json(await listAllImgSources());
    }

    const categoryId = Number(searchParams.get("category_id"));

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return NextResponse.json({ error: "分类 id 无效。" }, { status: 400 });
    }

    return NextResponse.json(await listImgSourcesByCategory(categoryId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取原始图列表失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      category_id?: number;
      source_kind?: "outline" | "color" | "scene_color";
      image_url?: string | null;
      local_file_path?: string | null;
      title?: string | null;
      description?: string | null;
      prompt_key?: string | null;
      prompt_group?: string | null;
      prompt_text_zh?: string | null;
      prompt_text_en?: string | null;
      sort_order?: number;
      is_active?: boolean;
    };

    if (!Number.isInteger(body.category_id) || Number(body.category_id) <= 0) {
      return NextResponse.json({ error: "请选择分类。" }, { status: 400 });
    }

    const item = await createImgSource({
      category_id: Number(body.category_id),
      source_kind:
        body.source_kind === "scene_color"
          ? "scene_color"
          : body.source_kind === "color"
            ? "color"
            : "outline",
      image_url: body.image_url ?? null,
      local_file_path: body.local_file_path ?? null,
      title: body.title ?? null,
      description: body.description ?? null,
      prompt_key: body.prompt_key ?? null,
      prompt_group: body.prompt_group ?? null,
      prompt_text_zh: body.prompt_text_zh ?? null,
      prompt_text_en: body.prompt_text_en ?? null,
      sort_order: Number(body.sort_order ?? 0),
      is_active: body.is_active !== false,
    });

    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建原始图失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
