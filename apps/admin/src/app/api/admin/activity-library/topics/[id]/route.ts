import { NextResponse } from "next/server";

import { deleteActivityTopic, updateActivityTopic, type ActivityTopicInput } from "@/lib/activity-item-library";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    const topic = updateActivityTopic(Number((await context.params).id), (await request.json()) as ActivityTopicInput);
    return NextResponse.json(topic);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新主题失败。" }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    await deleteActivityTopic(Number((await context.params).id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除主题失败。" }, { status: 400 });
  }
}
