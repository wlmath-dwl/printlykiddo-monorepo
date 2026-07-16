import { NextResponse } from "next/server";

import { deleteImgSource, getImgSourceById, updateImgSource, updateImgSourcePromptGroup } from "@/lib/admin-db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const item = await getImgSourceById(Number(id));

  if (!item) {
    return NextResponse.json({ error: "原始图不存在。" }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      update_mode?: "prompt_group";
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

    if (body.update_mode === "prompt_group") {
      const item = await updateImgSourcePromptGroup(Number(id), body.prompt_group ?? null);
      return NextResponse.json(item);
    }

    const item = await updateImgSource(Number(id), {
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
    const message = error instanceof Error ? error.message : "更新原始图失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deleteImgSource(Number(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除原始图记录失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
