import { NextResponse } from "next/server";

import { cancelCategoryPinItems, saveCategoryPinItemsToCycle } from "@/lib/admin-db";
import type { PinPublishCategoryItemInput } from "@/lib/admin-db";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      cycle_id?: number;
      pose_id?: number;
      items?: PinPublishCategoryItemInput[];
    };

    if (!Number.isInteger(body.cycle_id) || Number(body.cycle_id) <= 0) {
      return NextResponse.json({ error: "周期 ID 无效。" }, { status: 400 });
    }
    if (!Number.isInteger(body.pose_id) || Number(body.pose_id) <= 0) {
      return NextResponse.json({ error: "姿态 ID 无效。" }, { status: 400 });
    }

    const result = await saveCategoryPinItemsToCycle(
      Number(id),
      Number(body.cycle_id),
      Number(body.pose_id),
      Array.isArray(body.items) ? body.items : [],
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存 Pin 图文到周期失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const item = await cancelCategoryPinItems(Number(id));
    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "取消 Pin 失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
