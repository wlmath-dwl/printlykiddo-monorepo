import { NextResponse } from "next/server";

import {
  deleteSpecialPage,
  getSpecialPageById,
  updateSpecialPage,
} from "@/lib/admin-db";
import type { SpecialPageInput } from "@/lib/admin-db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const item = await getSpecialPageById(Number(id));

  if (!item) {
    return NextResponse.json({ error: "专题页不存在。" }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as SpecialPageInput;
    const item = await updateSpecialPage(Number(id), body);
    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新专题页失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deleteSpecialPage(Number(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除专题页失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
