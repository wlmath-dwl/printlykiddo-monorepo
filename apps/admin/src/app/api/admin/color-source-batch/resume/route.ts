import { NextResponse } from "next/server";
import { resumeColorSourceBatch } from "@/lib/color-source-batch";
export const runtime = "nodejs";
export async function POST() {
  try { return NextResponse.json(await resumeColorSourceBatch()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "继续失败。" }, { status: 500 }); }
}
