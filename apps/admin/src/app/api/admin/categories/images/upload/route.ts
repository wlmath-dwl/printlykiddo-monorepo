import { NextResponse } from "next/server";

import { cleanupOrphanedStagedFiles } from "@/lib/local-admin-db";
import { stagePendingCategoryImageFile } from "@/lib/local-image-storage";

export async function POST(request: Request) {
  try {
    await cleanupOrphanedStagedFiles();

    const formData = await request.formData();
    const file = formData.get("file");
    const shouldNormalize = formData.get("normalize") !== "0";
    const presetValue = formData.get("preset");
    const preset =
      presetValue === "cover" ||
      presetValue === "generated_cover" ||
      presetValue === "generated_card" ||
      presetValue === "generated_pdf"
        ? presetValue
        : "default";

    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "请选择要上传的图片文件。" }, { status: 400 });
    }

    const stagedFile = await stagePendingCategoryImageFile(file, {
      normalize: shouldNormalize,
      preset,
    });

    return NextResponse.json({
      id: stagedFile.id,
      local_file_path: stagedFile.local_file_path,
      file_name: stagedFile.file_name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传分类图片失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
