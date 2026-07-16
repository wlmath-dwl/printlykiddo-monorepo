import { NextResponse } from "next/server";

import { generateImgsFromCategorySources } from "@/lib/img-generation-workflow";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      category_id?: number;
      replace_existing?: boolean;
    };

    if (!Number.isInteger(body.category_id) || Number(body.category_id) <= 0) {
      return NextResponse.json({ error: "分类 id 无效。" }, { status: 400 });
    }

    const result = await generateImgsFromCategorySources({
      categoryId: Number(body.category_id),
      replaceExisting: body.replace_existing,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "批量生成功能图片失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
