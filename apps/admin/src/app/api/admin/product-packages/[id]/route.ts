import { NextResponse } from "next/server";

import {
  deleteProductPackage,
  getProductPackageById,
  updateProductPackage,
} from "@/lib/admin-db";
import type { ProductPackageInput } from "@/lib/admin-db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const item = await getProductPackageById(Number(id));

  if (!item) {
    return NextResponse.json({ error: "产品包不存在。" }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as ProductPackageInput;
    const item = await updateProductPackage(Number(id), body);
    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新产品包失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deleteProductPackage(Number(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除产品包失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
