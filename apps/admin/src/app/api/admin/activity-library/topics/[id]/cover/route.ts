import { NextResponse } from "next/server";

import { deleteActivityTopicCover, saveActivityTopicCover } from "@/lib/activity-item-library";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "请选择图片。" }, { status: 400 });
    return NextResponse.json(await saveActivityTopicCover(Number((await context.params).id), file));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "上传主题图片失败。" }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    await deleteActivityTopicCover(Number((await context.params).id));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除主题图片失败。" }, { status: 400 });
  }
}
