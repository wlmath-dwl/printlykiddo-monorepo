import { NextResponse } from "next/server";

import { releaseStagedImageFile } from "@/lib/local-admin-db";

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as {
      local_file_path?: string;
    };

    if (!body.local_file_path?.trim()) {
      return NextResponse.json({ error: "暂存文件路径不能为空。" }, { status: 400 });
    }

    await releaseStagedImageFile(body.local_file_path);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "清理暂存文件失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
