import { NextResponse } from "next/server";

import { readManagedFile } from "@/lib/local-image-storage";

const DEFAULT_IMAGE_PROXY_BASE_URL = "https://img.printlykiddo.com";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const path = searchParams.get("path");

    if (!path?.trim()) {
      return NextResponse.json({ error: "图片路径不能为空。" }, { status: 400 });
    }

    const objectKey = path.trim();

    try {
      const fileBuffer = await readManagedFile(objectKey);
      return new NextResponse(new Uint8Array(fileBuffer), {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "no-store",
        },
      });
    } catch {
      // 本地镜像不存在时，继续尝试远端图片代理地址。
    }

    const imageProxyBaseUrl =
      process.env.NEXT_PUBLIC_IMAGE_PROXY_BASE_URL?.trim() || DEFAULT_IMAGE_PROXY_BASE_URL;
    const targetUrl = `${imageProxyBaseUrl.replace(/\/+$/, "")}/${objectKey.replace(/^\/+/, "")}`;
    const response = await fetch(targetUrl, { cache: "no-store" });

    if (!response.ok) {
      return NextResponse.json({ error: "首页图片不存在。" }, { status: 404 });
    }

    const fileBuffer = Buffer.from(await response.arrayBuffer());
    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "image/webp",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取首页图片失败。";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
