import { NextResponse } from "next/server";

import { saveSpecialPageImageFile } from "@/lib/local-image-storage";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const slug = typeof formData.get("slug") === "string" ? String(formData.get("slug")) : "";
    const variant = formData.get("variant") === "card" ? "card" : "hero";

    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "请选择要上传的图片文件。" }, { status: 400 });
    }

    const savedFile = await saveSpecialPageImageFile(file, slug, variant);

    return NextResponse.json({
      image_url: savedFile.object_key,
      hero_image_url: savedFile.object_key,
      variant,
      local_file_path: savedFile.local_file_path,
      file_name: savedFile.file_name,
      file_size: savedFile.file_size,
      file_type: savedFile.file_type,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "上传专题图片失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
