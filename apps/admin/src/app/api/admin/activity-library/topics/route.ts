import { NextResponse } from "next/server";

import { createActivityTopic, listActivityTopics, type ActivityTopicInput } from "@/lib/activity-item-library";

export async function GET() {
  return NextResponse.json({ items: listActivityTopics() });
}

export async function POST(request: Request) {
  try {
    const topic = createActivityTopic((await request.json()) as ActivityTopicInput);
    return NextResponse.json(topic);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "创建主题失败。" }, { status: 400 });
  }
}
