import { NextResponse } from "next/server";

import { createActivityTag, listActivityTags, type ActivityTagInput } from "@/lib/activity-item-library";

export async function GET() {
  return NextResponse.json({ items: listActivityTags() });
}

export async function POST(request: Request) {
  try {
    const tag = createActivityTag((await request.json()) as ActivityTagInput);
    return NextResponse.json(tag);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建 Topic 分组失败。" }, { status: 400 });
  }
}
