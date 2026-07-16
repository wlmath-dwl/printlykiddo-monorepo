import { NextResponse } from "next/server";

import { createImg, listImgs } from "@/lib/admin-db";

function parseBoolean(value: string | null) {
  if (value === "true" || value === "1") {
    return true;
  }

  if (value === "false" || value === "0") {
    return false;
  }

  return undefined;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    return NextResponse.json(
      await listImgs({
        category_id: searchParams.get("category_id")
          ? Number(searchParams.get("category_id"))
          : undefined,
        active_id: searchParams.get("active_id")
          ? Number(searchParams.get("active_id"))
          : undefined,
        is_active: parseBoolean(searchParams.get("is_active")),
        keyword: searchParams.get("keyword") || undefined,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取图片列表失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      category_id?: number;
      active_id?: number;
      image_url?: string;
      image_url_card?: string;
      local_file_path?: string | null;
      local_file_path_card?: string | null;
      answer_image_url?: string | null;
      answer_local_file_path?: string | null;
      title?: string | null;
      slug?: string | null;
      description?: string | null;
      difficulty?: number | null;
      sort_order?: number;
      is_active?: boolean;
    };

    if (!Number.isInteger(body.category_id) || Number(body.category_id) <= 0) {
      return NextResponse.json({ error: "请选择分类。" }, { status: 400 });
    }

    if (!Number.isInteger(body.active_id) || Number(body.active_id) <= 0) {
      return NextResponse.json({ error: "请选择功能。" }, { status: 400 });
    }

    if (!body.image_url?.trim()) {
      return NextResponse.json({ error: "请先上传图片。" }, { status: 400 });
    }

    if (!body.image_url_card?.trim()) {
      return NextResponse.json({ error: "请先生成卡片图。" }, { status: 400 });
    }

    const item = await createImg({
      category_id: Number(body.category_id),
      active_id: Number(body.active_id),
      image_url: body.image_url,
      image_url_card: body.image_url_card,
      local_file_path: body.local_file_path ?? null,
      local_file_path_card: body.local_file_path_card ?? null,
      answer_image_url: body.answer_image_url ?? null,
      answer_local_file_path: body.answer_local_file_path ?? null,
      title: body.title ?? null,
      slug: body.slug ?? null,
      description: body.description ?? null,
      difficulty: body.difficulty ?? null,
      sort_order: Number(body.sort_order ?? 0),
      is_active: body.is_active !== false,
    });

    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建图片失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
