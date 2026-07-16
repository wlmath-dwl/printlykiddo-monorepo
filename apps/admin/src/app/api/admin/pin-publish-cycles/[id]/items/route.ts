import { NextResponse } from "next/server";

import { listPinPublishScheduleItems, updatePinPublishScheduleItem } from "@/lib/admin-db";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await listPinPublishScheduleItems(Number(id)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取 Pin 图排期失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: number;
      publish_time?: string;
      image_url?: string | null;
      title?: string | null;
      description?: string | null;
      pin_url?: string | null;
      uploaded?: boolean;
    };
    if (!Number.isInteger(body.id) || Number(body.id) <= 0) {
      return NextResponse.json({ error: "排期记录 ID 无效。" }, { status: 400 });
    }

    return NextResponse.json(await updatePinPublishScheduleItem(Number(body.id), body));
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存 Pin 图排期失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
