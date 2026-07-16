import { NextResponse } from "next/server";

import { createSpecialPage, listSpecialPages } from "@/lib/admin-db";
import type { SpecialPageInput } from "@/lib/admin-db";

export async function GET() {
  try {
    return NextResponse.json(await listSpecialPages());
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取专题页失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SpecialPageInput;
    const item = await createSpecialPage(body);
    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建专题页失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
