import { NextResponse } from "next/server";

import { buildLegacyRemoteCategoryImageKey, buildPendingCategoryImagePath } from "@/lib/category-image";
import { resolveCategoryImageObjectKey } from "@/lib/local-admin-db";
import { normalizeUploadBufferToWebp, readManagedFile } from "@/lib/local-image-storage";

const DEFAULT_IMAGE_PROXY_BASE_URL = "https://img.printlykiddo.com";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const shouldProxy = searchParams.get("proxy") === "1";
    const shouldNormalize = searchParams.get("normalized") === "1";

    if (!id?.trim()) {
      return NextResponse.json({ error: "图片 id 不能为空。" }, { status: 400 });
    }

    const pendingPath = buildPendingCategoryImagePath(id);

    try {
      const fileBuffer = await readManagedFile(pendingPath);
      const outputBuffer = shouldNormalize
        ? await normalizeUploadBufferToWebp(fileBuffer)
        : fileBuffer;
      return new NextResponse(new Uint8Array(outputBuffer), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      // 继续尝试本地镜像路径或远端代理地址。
    }

    const remoteObjectKey = await resolveCategoryImageObjectKey(id, { includeDeleted: true });
    try {
      const fileBuffer = await readManagedFile(remoteObjectKey);
      const outputBuffer = shouldNormalize
        ? await normalizeUploadBufferToWebp(fileBuffer)
        : fileBuffer;
      return new NextResponse(new Uint8Array(outputBuffer), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      // 本地镜像不存在时，继续尝试远端代理地址。
    }

    const imageProxyBaseUrl =
      process.env.NEXT_PUBLIC_IMAGE_PROXY_BASE_URL?.trim() || DEFAULT_IMAGE_PROXY_BASE_URL;
    const baseUrl = imageProxyBaseUrl.replace(/\/+$/, "");
    const targetUrl = `${baseUrl}/${remoteObjectKey}`;

    if (shouldProxy || shouldNormalize) {
      let response = await fetch(targetUrl, { cache: "no-store" });

      if (!response.ok && remoteObjectKey !== buildLegacyRemoteCategoryImageKey(id)) {
        response = await fetch(`${baseUrl}/${buildLegacyRemoteCategoryImageKey(id)}`, {
          cache: "no-store",
        });
      }

      if (!response.ok) {
        return NextResponse.json({ error: "远端分类图片不存在。" }, { status: 404 });
      }

      const sourceBuffer = Buffer.from(await response.arrayBuffer());
      const outputBuffer = shouldNormalize
        ? await normalizeUploadBufferToWebp(sourceBuffer)
        : sourceBuffer;
      return new NextResponse(new Uint8Array(outputBuffer), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "no-store",
        },
      });
    }

    if (remoteObjectKey !== buildLegacyRemoteCategoryImageKey(id)) {
      const headResponse = await fetch(targetUrl, { method: "HEAD", cache: "no-store" });
      if (!headResponse.ok) {
        return NextResponse.redirect(`${baseUrl}/${buildLegacyRemoteCategoryImageKey(id)}`);
      }
    }

    return NextResponse.redirect(targetUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取分类图片失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
