import { NextResponse } from "next/server";

import { getActiveById, getCategoryById, getCategorySlugPathSegments } from "@/lib/admin-db";
import { cleanupOrphanedStagedFiles } from "@/lib/local-admin-db";
import { saveManagedImageFileAtPath } from "@/lib/local-image-storage";
import { buildImgObjectKeys } from "@/lib/img-storage";

export async function POST(request: Request) {
  try {
    await cleanupOrphanedStagedFiles();

    const formData = await request.formData();
    const file = formData.get("file");
    const categoryId = Number(formData.get("category_id"));
    const activeId = Number(formData.get("active_id"));

    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "请选择要上传的图片文件。" }, { status: 400 });
    }

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      return NextResponse.json({ error: "请先选择分类。" }, { status: 400 });
    }

    if (!Number.isInteger(activeId) || activeId <= 0) {
      return NextResponse.json({ error: "请先选择功能。" }, { status: 400 });
    }

    const [category, active, categorySlugPath] = await Promise.all([
      getCategoryById(categoryId),
      getActiveById(activeId),
      getCategorySlugPathSegments(categoryId),
    ]);

    if (!category) {
      return NextResponse.json({ error: "分类不存在。" }, { status: 404 });
    }

    if (!active) {
      return NextResponse.json({ error: "功能不存在。" }, { status: 404 });
    }

    const objectKeys = buildImgObjectKeys({
      categorySlugPath,
      activeSlug: active.slug,
      fileName: file.name,
    });
    const [mainFile, cardFile] = await Promise.all([
      saveManagedImageFileAtPath(file, objectKeys.image_url, {
        preset: "generated_pdf",
        normalize: false,
      }),
      saveManagedImageFileAtPath(file, objectKeys.image_url_card, {
        preset: "generated_card",
        normalize: false,
      }),
    ]);

    return NextResponse.json({
      image_url: objectKeys.image_url,
      image_url_card: objectKeys.image_url_card,
      local_file_path: mainFile.local_file_path,
      local_file_path_card: cardFile.local_file_path,
      file_name: mainFile.file_name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传图片失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
