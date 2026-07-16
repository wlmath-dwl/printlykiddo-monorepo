import { NextResponse } from "next/server";

import { addMazeThemeAsset } from "@/lib/maze-theme-storage";
import type {
  MazeDecorationRole,
  MazeDecorationSizeLevel,
  MazeDecorationSlot,
  MazeDecorationVisualWeight,
} from "@/lib/maze-theme-types";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("请选择素材图片。");
    const asset = await addMazeThemeAsset(
      id,
      file,
      String(form.get("role") ?? "corner_medium") as MazeDecorationRole,
      String(form.get("name") ?? ""),
      {
        size_level: String(form.get("size_level") ?? "medium") as MazeDecorationSizeLevel,
        slot_allowed: form.getAll("slot_allowed").map(String) as MazeDecorationSlot[],
        visual_weight: String(form.get("visual_weight") ?? "normal") as MazeDecorationVisualWeight,
      },
    );
    return NextResponse.json(asset);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "上传素材失败。" },
      { status: 400 },
    );
  }
}
