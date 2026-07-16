import { NextResponse } from "next/server";

import { getCategorySlugPathSegments } from "@/lib/admin-db";
import { saveImgSourceFile } from "@/lib/img-source-storage";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const categoryId = Number(formData.get("category_id"));

    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "请选择要上传的原始图。" }, { status: 400 });
    }

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return NextResponse.json({ error: "请先选择分类。" }, { status: 400 });
    }

    const categorySlugPath = await getCategorySlugPathSegments(categoryId);
    const savedFile = await saveImgSourceFile(file, categorySlugPath);

    return NextResponse.json(savedFile);
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传原始图失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
