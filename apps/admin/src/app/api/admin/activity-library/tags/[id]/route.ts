import { NextResponse } from "next/server";

import { deleteActivityTag, updateActivityTag, type ActivityTagInput } from "@/lib/activity-item-library";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    const tag = updateActivityTag(Number((await context.params).id), (await request.json()) as ActivityTagInput);
    return NextResponse.json(tag);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新 Topic 分组失败。" }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    deleteActivityTag(Number((await context.params).id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除 Topic 分组失败。" }, { status: 400 });
  }
}
