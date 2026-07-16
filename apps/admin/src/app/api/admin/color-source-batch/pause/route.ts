import { NextResponse } from "next/server";
import { pauseColorSourceBatch } from "@/lib/color-source-batch";
export const runtime = "nodejs";
export async function POST() {
  try { return NextResponse.json(await pauseColorSourceBatch()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "暂停失败。" }, { status: 500 }); }
}
