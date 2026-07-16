import { NextResponse } from "next/server";

import { createBacklinkExchange, listBacklinkExchanges } from "@/lib/admin-db";
import type { BacklinkExchangeInput } from "@/lib/admin-db";

export async function GET() {
  try {
    return NextResponse.json(await listBacklinkExchanges());
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取外链台账失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BacklinkExchangeInput;
    const item = await createBacklinkExchange(body);
    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建外链台账失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
