import { NextResponse } from "next/server";

import {
  buildLegacyRemoteCategoryImageKey,
  buildPendingCategoryImagePath,
  type CategoryImageType,
} from "@/lib/category-image";
import { buildCategoryCutoutImageBuffer } from "@/lib/category-cutout";
import { cleanupOrphanedStagedFiles, resolveCategoryImageObjectKey } from "@/lib/local-admin-db";
import { readManagedFile, stagePendingCategoryImageBuffer } from "@/lib/local-image-storage";

export const runtime = "nodejs";

const DEFAULT_IMAGE_PROXY_BASE_URL = "https://img.printlykiddo.com";

type CutoutSourceType = Extract<CategoryImageType, "outline_original" | "color_original">;

type GenerateCutoutRequest = {
  sources?: Array<{
    id?: string;
    type?: CutoutSourceType;
  }>;
};

function toGeneratedType(type: CutoutSourceType) {
  return type === "outline_original" ? "cut_line" : "cut_color";
}

async function readCategoryImageBuffer(id: string) {
  const pendingPath = buildPendingCategoryImagePath(id);

  try {
    return await readManagedFile(pendingPath);
  } catch {
    const remoteObjectKey = await resolveCategoryImageObjectKey(id, { includeDeleted: true });
    try {
      return await readManagedFile(remoteObjectKey);
    } catch {
      // 本地镜像不存在时继续尝试远端。
    }

    const imageProxyBaseUrl =
      process.env.NEXT_PUBLIC_IMAGE_PROXY_BASE_URL?.trim() || DEFAULT_IMAGE_PROXY_BASE_URL;
    const baseUrl = imageProxyBaseUrl.replace(/\/+$/, "");
    let response = await fetch(`${baseUrl}/${remoteObjectKey}`, { cache: "no-store" });

    if (!response.ok && remoteObjectKey !== buildLegacyRemoteCategoryImageKey(id)) {
      response = await fetch(`${baseUrl}/${buildLegacyRemoteCategoryImageKey(id)}`, {
        cache: "no-store",
      });
    }

    if (!response.ok) {
      throw new Error("读取原始分类图片失败。");
    }

    return Buffer.from(await response.arrayBuffer());
  }
}

export async function POST(request: Request) {
  try {
    await cleanupOrphanedStagedFiles();

    const body = (await request.json()) as GenerateCutoutRequest;
    const sources = (body.sources ?? []).filter(
      (item): item is { id: string; type: CutoutSourceType } =>
        typeof item.id === "string" &&
        item.id.trim().length > 0 &&
        (item.type === "outline_original" || item.type === "color_original"),
    );

    if (sources.length === 0) {
      return NextResponse.json({ error: "请先提供要生成剪纸图的原图。" }, { status: 400 });
    }

    const items = [];

    for (const source of sources) {
      const originalBuffer = await readCategoryImageBuffer(source.id);
      const cutoutBuffer = await buildCategoryCutoutImageBuffer(originalBuffer);
      const stagedFile = await stagePendingCategoryImageBuffer(cutoutBuffer);

      items.push({
        id: stagedFile.id,
        type: toGeneratedType(source.type),
      });
    }

    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成剪纸图失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
