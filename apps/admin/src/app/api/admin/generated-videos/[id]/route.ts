import { NextResponse } from "next/server";

import { deleteGeneratedVideo, updateGeneratedVideo } from "@/lib/admin-db";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deleteGeneratedVideo(Number(id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除视频数据失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { uploaded?: boolean };
    return NextResponse.json(await updateGeneratedVideo(Number(id), body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存视频发布状态失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
