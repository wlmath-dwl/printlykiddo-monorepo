import { NextResponse } from "next/server";

import { getCategorySummary } from "@/lib/local-admin-db";

export async function GET() {
  try {
    return NextResponse.json(await getCategorySummary());
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取分类汇总失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
