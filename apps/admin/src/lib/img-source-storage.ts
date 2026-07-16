import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import slugify from "slugify";

import {
  resolveManagedFilePath,
  saveManagedImageBufferAtPath,
} from "@/lib/local-image-storage";

function normalizeSegment(value: string) {
  const normalized = slugify(value, {
    lower: true,
    strict: true,
    trim: true,
  });

  return normalized || "item";
}

function normalizeRelativePath(relativePath: string) {
  return relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
}

function buildFileName() {
  return `${randomUUID().replaceAll("-", "")}.webp`;
}

function buildSizedImgSourcePath(relativePath: string, size: number) {
  return relativePath.replace(/\.webp$/i, `-${size}.webp`);
}

async function convertSourceImageToWebpBuffer(file: File) {
  const inputBuffer = Buffer.from(await file.arrayBuffer());

  try {
    const sharp = (await import("sharp")).default;
    return await sharp(inputBuffer).rotate().webp({ quality: 90 }).toBuffer();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    throw new Error(`原始图转 WebP 失败：${message}`);
  }
}

async function resizeSourceBufferToWebp(inputBuffer: Buffer, size: number) {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(inputBuffer)
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize(size, size, { fit: "contain", background: "#ffffff" })
      .webp({ quality: 90 })
      .toBuffer();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    throw new Error(`原始图 ${size} 尺寸图生成失败：${message}`);
  }
}

async function saveImgSource512Sidecar(inputBuffer: Buffer, relativePath: string) {
  return saveManagedImageBufferAtPath(
    await resizeSourceBufferToWebp(inputBuffer, 512),
    buildSizedImgSourcePath(relativePath, 512),
    { normalize: false },
  );
}

export function buildImgSourceRelativePath(categorySlugPath: string[]) {
  const normalizedSegments = categorySlugPath.map(normalizeSegment);

  return normalizeRelativePath(
    path.join("imgs", "img_sources", ...normalizedSegments, buildFileName()),
  );
}

export async function saveImgSourceFile(file: File, categorySlugPath: string[]) {
  const relativePath = buildImgSourceRelativePath(categorySlugPath);
  const absolutePath = resolveManagedFilePath(relativePath);
  const webpBuffer = await convertSourceImageToWebpBuffer(file);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, webpBuffer);
  await saveImgSource512Sidecar(Buffer.from(await file.arrayBuffer()), relativePath);

  return {
    image_url: relativePath,
    local_file_path: relativePath,
    file_name: path.basename(relativePath),
    file_size: webpBuffer.length,
    file_type: "image/webp",
  };
}

export async function saveGeneratedImgSourceBuffer(
  buffer: Buffer,
  categorySlugPath: string[],
) {
  const relativePath = buildImgSourceRelativePath(categorySlugPath);
  const savedFile = await saveManagedImageBufferAtPath(buffer, relativePath, {
    normalize: false,
  });
  await saveImgSource512Sidecar(buffer, relativePath);

  return {
    image_url: relativePath,
    local_file_path: savedFile.local_file_path,
    file_name: savedFile.file_name,
    file_size: savedFile.file_size,
    file_type: savedFile.file_type,
  };
}
