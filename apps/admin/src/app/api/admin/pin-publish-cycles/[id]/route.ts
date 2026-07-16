import { NextResponse } from "next/server";

import { deletePinPublishCycle, getPinPublishCycle, updatePinPublishCycle } from "@/lib/admin-db";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const item = await getPinPublishCycle(Number(id));

  if (!item) {
    return NextResponse.json({ error: "Pin 图发布周期不存在。" }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      name?: string;
      start_date?: string;
      end_date?: string;
    };
    const item = await updatePinPublishCycle(Number(id), {
      name: body.name ?? "",
      start_date: body.start_date ?? "",
      end_date: body.end_date ?? "",
    });

    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新 Pin 图发布周期失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deletePinPublishCycle(Number(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除 Pin 图发布周期失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
