import { NextResponse } from "next/server";

import { generateProductPackagePdfFiles } from "@/lib/product-package-pdf";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const result = await generateProductPackagePdfFiles(Number(id));
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成产品包 PDF 失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
