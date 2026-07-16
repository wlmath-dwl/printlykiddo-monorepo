import { NextResponse } from "next/server";

import { createPinPublishCycle, listPinPublishCycles } from "@/lib/admin-db";

export async function GET() {
  try {
    return NextResponse.json(await listPinPublishCycles());
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取 Pin 图发布周期失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      start_date?: string;
      end_date?: string;
    };

    const item = await createPinPublishCycle({
      start_date: body.start_date ?? "",
      end_date: body.end_date ?? "",
    });

    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建 Pin 图发布周期失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
