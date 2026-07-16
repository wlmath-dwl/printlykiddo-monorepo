import { NextResponse } from "next/server";

import { readManagedFile } from "@/lib/local-image-storage";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const videoPath = searchParams.get("path");

    if (!videoPath?.trim()) {
      return NextResponse.json({ error: "视频路径不能为空。" }, { status: 400 });
    }

    const fileBuffer = await readManagedFile(videoPath.trim());
    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": "video/mp4",
        "Cache-Control": "no-store",
        "Accept-Ranges": "bytes",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取生成视频失败。";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
