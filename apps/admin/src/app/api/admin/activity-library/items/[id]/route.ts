import { NextResponse } from "next/server";

import { deleteActivityItem, getActivityItem, updateActivityItem, type ActivityItemInput } from "@/lib/activity-item-library";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  const item = getActivityItem(Number((await context.params).id));
  return item ? NextResponse.json(item) : NextResponse.json({ error: "素材不存在。" }, { status: 404 });
}

export async function PUT(request: Request, context: Context) {
  try {
    const item = updateActivityItem(Number((await context.params).id), (await request.json()) as ActivityItemInput);
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新素材失败。" }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    await deleteActivityItem(Number((await context.params).id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除素材失败。" }, { status: 400 });
  }
}
