import { NextResponse } from "next/server";

import { deleteVideoPublishCycle, getVideoPublishCycle, updateVideoPublishCycle } from "@/lib/admin-db";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const item = await getVideoPublishCycle(Number(id));
    if (!item) {
      return NextResponse.json({ error: "视频周期不存在。" }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取视频周期失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deleteVideoPublishCycle(Number(id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除视频周期失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      start_date?: string;
      end_date?: string;
    };
    const item = await updateVideoPublishCycle(Number(id), {
      name: body.name ?? "",
      start_date: body.start_date ?? "",
      end_date: body.end_date ?? "",
    });

    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新视频周期失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
