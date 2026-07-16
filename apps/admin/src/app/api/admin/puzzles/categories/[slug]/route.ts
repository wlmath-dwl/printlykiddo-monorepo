import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { deleteManagedPuzzleFileFromR2, uploadManagedPuzzleFileToR2 } from "@/lib/cloudflare-sync";
import { deleteManagedFile, saveManagedImageFileAtPath } from "@/lib/local-image-storage";
import {
  getPuzzleCategory,
  updatePuzzleCategoryActive,
  updatePuzzleCategoryCover,
  writePuzzleFrontendSnapshot,
} from "@/lib/puzzle-local-db";

type RouteContext = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const category = getPuzzleCategory(slug);
  return category
    ? NextResponse.json(category)
    : NextResponse.json({ error: "益智分类不存在。" }, { status: 404 });
}

export async function POST(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  const current = getPuzzleCategory(slug);
  if (!current) return NextResponse.json({ error: "益智分类不存在。" }, { status: 404 });
  try {
    const form = await request.formData();
    const file = form.get("cover");
    if (!(file instanceof File) || file.size === 0) throw new Error("请选择封面图片。");
    const objectKey = `imgs/puzzles/covers/${slug}-${randomUUID().replaceAll("-", "")}.webp`;
    const saved = await saveManagedImageFileAtPath(file, objectKey, { preset: "hero" });
    await uploadManagedPuzzleFileToR2(objectKey, saved.local_file_path);
    const category = updatePuzzleCategoryCover(slug, objectKey, saved.local_file_path);
    await writePuzzleFrontendSnapshot();
    if (current.is_custom_cover) {
      await deleteManagedPuzzleFileFromR2(current.cover_image_url);
      await deleteManagedFile(current.cover_local_file_path);
    }
    return NextResponse.json(category);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新封面失败。" }, { status: 400 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { slug } = await context.params;
  if (!getPuzzleCategory(slug)) {
    return NextResponse.json({ error: "益智分类不存在。" }, { status: 404 });
  }
  try {
    const body = await request.json() as { is_active?: unknown };
    if (typeof body.is_active !== "boolean") throw new Error("活跃状态格式不正确。");
    const category = updatePuzzleCategoryActive(slug, body.is_active);
    await writePuzzleFrontendSnapshot();
    return NextResponse.json(category);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "更新活跃状态失败。" }, { status: 400 });
  }
}
