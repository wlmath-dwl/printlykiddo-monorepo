import { NextResponse } from "next/server";

import {
  listPinPublishCycleCategories,
  removeCategoryFromPinPublishCycle,
  setPinPublishCycleCategories,
} from "@/lib/admin-db";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await listPinPublishCycleCategories(Number(id)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取周期关联类型失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { category_ids?: number[] };
    return NextResponse.json(await setPinPublishCycleCategories(Number(id), body.category_ids ?? []));
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存周期关联类型失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const categoryId = Number(searchParams.get("category_id"));
    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return NextResponse.json({ error: "分类 ID 无效。" }, { status: 400 });
    }

    return NextResponse.json(await removeCategoryFromPinPublishCycle(Number(id), categoryId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "移除周期绑定分类失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
