import { NextResponse } from "next/server";

import { createActivityItem, listActivityItems, type ActivityItemInput, type ItemStatus } from "@/lib/activity-item-library";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const topicId = Number(params.get("topic_id"));
    return NextResponse.json({ items: listActivityItems({
      keyword: params.get("keyword") || undefined,
      topic_id: Number.isInteger(topicId) && topicId > 0 ? topicId : undefined,
      status: (params.get("status") || undefined) as ItemStatus | undefined,
    }) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "获取素材失败。" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const item = createActivityItem((await request.json()) as ActivityItemInput);
    return NextResponse.json(item);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建素材失败。" }, { status: 400 });
  }
}
