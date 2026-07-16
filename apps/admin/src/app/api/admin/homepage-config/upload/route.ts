import { NextResponse } from "next/server";

import { cleanupOrphanedStagedFiles } from "@/lib/local-admin-db";
import { saveHomepageImageFile } from "@/lib/local-image-storage";

export async function POST(request: Request) {
  try {
    await cleanupOrphanedStagedFiles();

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "请选择要上传的图片文件。" }, { status: 400 });
    }

    const stagedFile = await saveHomepageImageFile(file);

    return NextResponse.json({
      hero_image_url: stagedFile.object_key,
      local_file_path: stagedFile.local_file_path,
      file_name: stagedFile.file_name,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传首页图片失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
