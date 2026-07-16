import { NextResponse } from "next/server";

import { createPoseSource, listPoseSourcesByCategory } from "@/lib/admin-db";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = Number(searchParams.get("category_id"));

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return NextResponse.json({ error: "分类 id 无效。" }, { status: 400 });
    }

    return NextResponse.json(await listPoseSourcesByCategory(categoryId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取姿态原始图列表失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      category_id?: number;
    };

    if (!Number.isInteger(body.category_id) || Number(body.category_id) <= 0) {
      return NextResponse.json({ error: "请选择分类。" }, { status: 400 });
    }

    const item = await createPoseSource(Number(body.category_id));
    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建姿态失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
