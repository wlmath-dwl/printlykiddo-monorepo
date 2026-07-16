import { NextResponse } from "next/server";

import { completePinPublishCycle } from "@/lib/admin-db";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await completePinPublishCycle(Number(id)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "设置周期完成状态失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
