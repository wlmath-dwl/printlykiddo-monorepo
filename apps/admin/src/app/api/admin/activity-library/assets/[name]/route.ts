import { NextResponse } from "next/server";

import { deleteActivityAsset, readActivityAsset, updateActivityAsset, type AssetStatus } from "@/lib/activity-item-library";

type Context = { params: Promise<{ name: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const buffer = await readActivityAsset((await context.params).name);
    return new NextResponse(new Uint8Array(buffer), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=3600" } });
  } catch {
    return NextResponse.json({ error: "图片不存在。" }, { status: 404 });
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const id = Number((await context.params).name);
    const input = await request.json() as { status: AssetStatus };
    return NextResponse.json(updateActivityAsset(id, input.status));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新图片失败。" }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    await deleteActivityAsset(Number((await context.params).name));
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "删除图片失败。" }, { status: 400 });
  }
}
