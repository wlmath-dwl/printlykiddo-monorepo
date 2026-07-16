import { NextResponse } from "next/server";

import { listGeneratedVideos } from "@/lib/admin-db";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const cycleId = Number(id);
    if (!Number.isInteger(cycleId) || cycleId <= 0) {
      return NextResponse.json({ error: "视频周期 id 无效。" }, { status: 400 });
    }

    return NextResponse.json(await listGeneratedVideos(cycleId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取生成视频失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
