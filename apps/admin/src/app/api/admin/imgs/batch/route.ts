import { NextResponse } from "next/server";

import { deleteImgsBatch } from "@/lib/admin-db";

/** 批量软删除图片（与单条删除逻辑一致：outbox + 本地托管文件清理） */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { ids?: unknown };
    const raw = body.ids;
    if (!Array.isArray(raw) || raw.length === 0) {
      return NextResponse.json({ error: "请提供要删除的图片 id 列表。" }, { status: 400 });
    }

    const ids = raw
      .map((v) => Number(v))
      .filter((n) => Number.isInteger(n) && n > 0);

    if (ids.length === 0) {
      return NextResponse.json({ error: "id 无效。" }, { status: 400 });
    }

    const { deleted } = await deleteImgsBatch(ids);

    if (deleted === 0) {
      return NextResponse.json(
        { error: "所选图片不存在或已被删除。" },
        { status: 400 },
      );
    }

    return NextResponse.json({ deleted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "批量删除失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
