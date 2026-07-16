import { NextResponse } from "next/server";

import {
  deleteBacklinkExchange,
  getBacklinkExchangeById,
  updateBacklinkExchange,
} from "@/lib/admin-db";
import type { BacklinkExchangeInput } from "@/lib/admin-db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const item = await getBacklinkExchangeById(Number(id));

  if (!item) {
    return NextResponse.json({ error: "外链台账不存在。" }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as BacklinkExchangeInput;
    const item = await updateBacklinkExchange(Number(id), body);
    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新外链台账失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deleteBacklinkExchange(Number(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除外链台账失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
