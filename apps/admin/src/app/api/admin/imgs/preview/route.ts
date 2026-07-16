import { NextResponse } from "next/server";

import { readManagedFile } from "@/lib/local-image-storage";

const DEFAULT_IMAGE_PROXY_BASE_URL = "https://img.printlykiddo.com";

function buildContentDisposition(fileName: string | null) {
  const fallbackName = "image.webp";
  const normalizedName = (fileName?.trim() || fallbackName)
    .replace(/[/\\]/g, "-")
    .replace(/[\r\n"]/g, "")
    .trim() || fallbackName;

  return `attachment; filename="${normalizedName}"`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const imagePath = searchParams.get("path");
    const localFilePath = searchParams.get("local_file_path");
    const shouldDownload = searchParams.get("download") === "1";
    const downloadFileName = searchParams.get("filename");

    if (!imagePath?.trim() && !localFilePath?.trim()) {
      return NextResponse.json({ error: "图片路径不能为空。" }, { status: 400 });
    }

    if (localFilePath?.trim()) {
      try {
        const fileBuffer = await readManagedFile(localFilePath.trim());
        return new NextResponse(new Uint8Array(fileBuffer), {
          headers: {
            "Content-Type": "image/webp",
            "Cache-Control": "no-store",
            ...(shouldDownload
              ? { "Content-Disposition": buildContentDisposition(downloadFileName) }
              : {}),
          },
        });
      } catch {
        // 本地待同步文件不存在时，继续尝试远端图片代理。
      }
    }

    if (!imagePath?.trim()) {
      return NextResponse.json({ error: "图片不存在。" }, { status: 404 });
    }

    const imageProxyBaseUrl =
      process.env.NEXT_PUBLIC_IMAGE_PROXY_BASE_URL?.trim() || DEFAULT_IMAGE_PROXY_BASE_URL;
    const targetUrl = `${imageProxyBaseUrl.replace(/\/+$/, "")}/${imagePath.trim().replace(/^\/+/, "")}`;
    const response = await fetch(targetUrl, { cache: "no-store" });

    if (!response.ok) {
      return NextResponse.json({ error: "图片不存在。" }, { status: 404 });
    }

    const fileBuffer = Buffer.from(await response.arrayBuffer());
    return new NextResponse(new Uint8Array(fileBuffer), {
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "image/webp",
        "Cache-Control": "no-store",
        ...(shouldDownload
          ? { "Content-Disposition": buildContentDisposition(downloadFileName) }
          : {}),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取图片失败。";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
