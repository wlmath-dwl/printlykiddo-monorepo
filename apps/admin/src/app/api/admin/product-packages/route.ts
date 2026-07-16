import { NextResponse } from "next/server";

import { createProductPackage, listProductPackages } from "@/lib/admin-db";
import type { ProductPackageInput } from "@/lib/admin-db";

export async function GET() {
  try {
    return NextResponse.json(await listProductPackages());
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取产品包失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ProductPackageInput;
    const item = await createProductPackage(body);
    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建产品包失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
