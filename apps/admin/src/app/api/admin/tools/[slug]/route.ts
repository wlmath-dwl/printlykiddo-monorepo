import { NextResponse } from "next/server";

import { getToolPage, updateToolPageActive, writeToolFrontendSnapshot } from "@/lib/tool-local-db";

type RouteContext = { params: Promise<{ slug: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  if (!getToolPage(slug)) return NextResponse.json({ error: "工具不存在。" }, { status: 404 });
  try {
    const body = await request.json() as { is_active?: unknown };
    if (typeof body.is_active !== "boolean") throw new Error("活跃状态格式不正确。");
    const tool = updateToolPageActive(slug, body.is_active);
    await writeToolFrontendSnapshot();
    return NextResponse.json(tool);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新工具状态失败。" }, { status: 400 });
  }
}
