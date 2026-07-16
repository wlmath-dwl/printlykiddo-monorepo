import { NextResponse } from "next/server";

import { bindCategoryPinPublishCycle } from "@/lib/admin-db";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { cycle_id?: number | null };
    const cycleId = body.cycle_id === null || body.cycle_id === undefined ? null : Number(body.cycle_id);
    const item = await bindCategoryPinPublishCycle(Number(id), cycleId);
    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "绑定 Pin 图发布周期失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
