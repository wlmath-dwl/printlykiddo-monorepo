import { NextResponse } from "next/server";

import { createActivityAsset, listActivityAssets, type AssetStatus, type AssetType } from "@/lib/activity-item-library";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const itemId = Number(params.get("item_id"));
  return NextResponse.json({ items: listActivityAssets({
    item_id: Number.isInteger(itemId) && itemId > 0 ? itemId : undefined,
    type: (params.get("type") || undefined) as AssetType | undefined,
    status: (params.get("status") || undefined) as AssetStatus | undefined,
  }) });
}

export async function POST(request: Request) {
  try {
    const data = await request.formData();
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) return NextResponse.json({ error: "请选择图片。" }, { status: 400 });
    const asset = await createActivityAsset(file, {
      item_id: Number(data.get("item_id")),
      type: String(data.get("type")) as AssetType,
      status: String(data.get("status") || "uploaded") as AssetStatus,
    });
    return NextResponse.json(asset);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "上传图片失败。" }, { status: 400 });
  }
}
