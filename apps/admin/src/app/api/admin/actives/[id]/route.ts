import { NextResponse } from "next/server";

import { deleteActive, getActiveById, updateActive } from "@/lib/admin-db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const activeId = Number(id);
  const item = await getActiveById(activeId);

  if (!item) {
    return NextResponse.json({ error: "功能不存在。" }, { status: 404 });
  }

  return NextResponse.json({
    ...item,
  });
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      slug?: string;
      description?: string | null;
      sort_order?: number;
      colored_label?: boolean;
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "功能名称不能为空。" }, { status: 400 });
    }

    const item = await updateActive(Number(id), {
      name: body.name,
      slug: body.slug,
      description: body.description ?? null,
      sort_order: Number(body.sort_order ?? 0),
      colored_label: body.colored_label === true,
    });

    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新功能失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deleteActive(Number(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除功能失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
