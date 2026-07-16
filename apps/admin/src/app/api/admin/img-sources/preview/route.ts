import { NextResponse } from "next/server";

import { readManagedFile } from "@/lib/local-image-storage";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const imagePath = searchParams.get("path");

    if (!imagePath?.trim()) {
      return NextResponse.json({ error: "图片路径不能为空。" }, { status: 400 });
    }

    const fileBuffer = await readManagedFile(imagePath.trim().replace(/^\/+/, ""));
    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取原始图失败。";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
