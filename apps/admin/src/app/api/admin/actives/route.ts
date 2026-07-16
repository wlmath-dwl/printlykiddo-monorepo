import { NextResponse } from "next/server";

import { createActive, listActives } from "@/lib/admin-db";

export async function GET() {
  try {
    return NextResponse.json(await listActives());
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取功能列表失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
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

    const item = await createActive({
      name: body.name,
      slug: body.slug,
      description: body.description ?? null,
      sort_order: Number(body.sort_order ?? 0),
      colored_label: body.colored_label === true,
    });

    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建功能失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
