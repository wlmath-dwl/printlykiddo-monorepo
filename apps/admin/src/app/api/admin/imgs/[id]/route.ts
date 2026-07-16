import { NextResponse } from "next/server";

import { deleteImg, getImgById, updateImg } from "@/lib/admin-db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const item = await getImgById(Number(id));

  if (!item) {
    return NextResponse.json({ error: "图片不存在。" }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
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

    const item = await updateImg(Number(id), {
      category_id: Number(body.category_id),
      active_id: Number(body.active_id),
      image_url: body.image_url,
      image_url_card: body.image_url_card,
      local_file_path: body.local_file_path ?? undefined,
      local_file_path_card: body.local_file_path_card ?? undefined,
      answer_image_url: body.answer_image_url ?? undefined,
      answer_local_file_path: body.answer_local_file_path ?? undefined,
      title: body.title ?? null,
      slug: body.slug ?? null,
      description: body.description ?? null,
      difficulty: body.difficulty,
      sort_order: Number(body.sort_order ?? 0),
      is_active: body.is_active !== false,
    });

    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新图片失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deleteImg(Number(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除图片失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
