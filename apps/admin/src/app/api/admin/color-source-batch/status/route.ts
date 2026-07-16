import { NextResponse } from "next/server";
import { getColorSourceBatchStatus } from "@/lib/color-source-batch";
export const runtime = "nodejs";
export async function GET() {
  try { return NextResponse.json(await getColorSourceBatchStatus()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "获取状态失败。" }, { status: 500 }); }
}
