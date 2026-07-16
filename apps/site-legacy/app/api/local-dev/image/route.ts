import { promises as fs } from "node:fs";

import { NextResponse } from "next/server";

import {
  buildLocalDevCategoryPendingPath,
  resolveCategoryImageObjectKeyFromLocalDb,
  resolveLocalAdminManagedFilePath,
} from "@/lib/local-dev-images";
import { isPrintlyKiddoLocalDev } from "@/lib/printly-local-dev";

function getContentTypeByPath(filePath: string) {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".png")) {
    return "image/png";
  }
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lower.endsWith(".gif")) {
    return "image/gif";
  }
  if (lower.endsWith(".svg")) {
    return "image/svg+xml";
  }
  return "image/webp";
}

async function tryReadManagedFile(relativePath: string) {
  try {
    const absolutePath = resolveLocalAdminManagedFilePath(relativePath);
    const buffer = await fs.readFile(absolutePath);
    return {
      buffer,
      contentType: getContentTypeByPath(relativePath),
    };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  if (!isPrintlyKiddoLocalDev()) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const localFilePath = searchParams.get("local_file_path")?.trim() || "";
    const relativePath = searchParams.get("path")?.trim() || "";
    const categoryImageId = searchParams.get("category_image_id")?.trim() || "";

    if (!localFilePath && !relativePath && !categoryImageId) {
      return NextResponse.json({ error: "图片路径不能为空。" }, { status: 400 });
    }

    if (localFilePath) {
      const localFile = await tryReadManagedFile(localFilePath);
      if (localFile) {
        return new NextResponse(new Uint8Array(localFile.buffer), {
          headers: {
            "Content-Type": localFile.contentType,
            "Cache-Control": "no-store",
          },
        });
      }
    }

    if (categoryImageId) {
      const pendingFile = await tryReadManagedFile(
        buildLocalDevCategoryPendingPath(categoryImageId),
      );
      if (pendingFile) {
        return new NextResponse(new Uint8Array(pendingFile.buffer), {
          headers: {
            "Content-Type": pendingFile.contentType,
            "Cache-Control": "no-store",
          },
        });
      }

      const objectKey = resolveCategoryImageObjectKeyFromLocalDb(categoryImageId);
      const mirroredFile = await tryReadManagedFile(objectKey);
      if (mirroredFile) {
        return new NextResponse(new Uint8Array(mirroredFile.buffer), {
          headers: {
            "Content-Type": mirroredFile.contentType,
            "Cache-Control": "no-store",
          },
        });
      }
    }

    if (relativePath) {
      const file = await tryReadManagedFile(relativePath);
      if (file) {
        return new NextResponse(new Uint8Array(file.buffer), {
          headers: {
            "Content-Type": file.contentType,
            "Cache-Control": "no-store",
          },
        });
      }
    }

    return NextResponse.json({ error: "图片不存在。" }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取图片失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
