import { NextResponse } from "next/server";

import {
  deleteMazeThemeAsset,
  readMazeThemeAsset,
  updateMazeThemeAsset,
} from "@/lib/maze-theme-storage";
import type {
  MazeDecorationRole,
  MazeDecorationSizeLevel,
  MazeDecorationSlot,
  MazeDecorationVisualWeight,
} from "@/lib/maze-theme-types";

type Context = { params: Promise<{ id: string; assetId: string }> };

export async function GET(_: Request, context: Context) {
  const { id, assetId } = await context.params;
  const result = await readMazeThemeAsset(id, assetId);
  if (!result) return NextResponse.json({ error: "主题素材不存在。" }, { status: 404 });
  return new NextResponse(new Uint8Array(result.buffer), {
    headers: { "Content-Type": result.asset.mime_type, "Cache-Control": "no-store" },
  });
}

export async function DELETE(_: Request, context: Context) {
  try {
    const { id, assetId } = await context.params;
    await deleteMazeThemeAsset(id, assetId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除素材失败。" },
      { status: 400 },
    );
  }
}

export async function PUT(request: Request, context: Context) {
  try {
    const { id, assetId } = await context.params;
    const form = await request.formData();
    const fileEntry = form.get("file");
    const asset = await updateMazeThemeAsset(id, assetId, {
      name: String(form.get("name") ?? ""),
      role: String(form.get("role") ?? "corner_medium") as MazeDecorationRole,
      size_level: String(form.get("size_level") ?? "medium") as MazeDecorationSizeLevel,
      slot_allowed: form.getAll("slot_allowed").map(String) as MazeDecorationSlot[],
      visual_weight: String(form.get("visual_weight") ?? "normal") as MazeDecorationVisualWeight,
      file: fileEntry instanceof File ? fileEntry : null,
    });
    return NextResponse.json(asset);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新素材失败。" },
      { status: 400 },
    );
  }
}
