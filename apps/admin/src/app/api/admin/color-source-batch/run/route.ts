import { NextResponse } from "next/server";
import { startColorSourceBatch } from "@/lib/color-source-batch";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as { category_ids?: number[] };
    const categoryIds = Array.isArray(body.category_ids) ? body.category_ids.filter(Number.isInteger) : [];
    if (categoryIds.length === 0) return NextResponse.json({ error: "请选择至少一个分类。" }, { status: 400 });
    return NextResponse.json(await startColorSourceBatch(categoryIds));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "启动失败。" }, { status: 500 });
  }
}
