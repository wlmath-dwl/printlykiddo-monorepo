import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import {
  CATEGORY_IMAGE_SIZES,
  type CategoryImageSize,
  buildPendingCategoryImagePath,
  getCategoryImageFileName,
} from "@/lib/category-image";
import { toWebpFileName } from "@/lib/image-format";

const DATA_DIR = path.join(process.cwd(), "data");
const PENDING_UPLOAD_DIR = path.join(DATA_DIR, "uploads", "pending");
const COVER_IMAGE_SIZE_PX = 256;
const GENERATED_CARD_SIZE_PX = 512;
const GENERATED_PDF_SIZE_PX = 1280;
const HERO_IMAGE_MAX_SIZE_PX = 1024;
const SPECIAL_PAGE_HERO_WIDTH_PX = 1600;
const SPECIAL_PAGE_HERO_HEIGHT_PX = 900;
const SPECIAL_PAGE_CARD_SIZE_PX = 512;
const WEBP_QUALITY = 86;
const FOREGROUND_ALPHA_THRESHOLD = 24;
const WHITE_BACKGROUND_THRESHOLD = 245;

type ForegroundBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

function normalizeRelativePath(relativePath: string) {
  return relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
}

export function buildPendingHomepageImagePath(objectKey: string) {
  return normalizeRelativePath(path.join("uploads", "pending", objectKey));
}

async function ensureUploadDir() {
  await fs.mkdir(PENDING_UPLOAD_DIR, { recursive: true });
}

function buildStagedFileName() {
  return `${randomUUID().replaceAll("-", "")}.webp`;
}

function isForegroundPixel(r: number, g: number, b: number, a: number) {
  if (a < FOREGROUND_ALPHA_THRESHOLD) {
    return false;
  }

  if (a < 250) {
    return true;
  }

  return !(r >= WHITE_BACKGROUND_THRESHOLD && g >= WHITE_BACKGROUND_THRESHOLD && b >= WHITE_BACKGROUND_THRESHOLD);
}

function findForegroundBounds(bitmap: Buffer, width: number, height: number): ForegroundBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (
        !isForegroundPixel(
          bitmap[offset],
          bitmap[offset + 1],
          bitmap[offset + 2],
          bitmap[offset + 3],
        )
      ) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < 0 || maxY < 0) {
    return null;
  }

  return { minX, minY, maxX, maxY };
}

function calculateCenteredSquareCropSize(bounds: ForegroundBounds, squareSize: number) {
  const center = squareSize / 2;
  const halfSize = Math.max(
    center - bounds.minX,
    bounds.maxX + 1 - center,
    center - bounds.minY,
    bounds.maxY + 1 - center,
  );

  return Math.max(1, Math.min(squareSize, Math.ceil(halfSize * 2)));
}

function calculateSquareCropRegion(width: number, height: number, bounds: ForegroundBounds | null) {
  const maxSquareSize = Math.min(width, height);

  if (!bounds) {
    return {
      left: Math.floor((width - maxSquareSize) / 2),
      top: Math.floor((height - maxSquareSize) / 2),
      size: maxSquareSize,
    };
  }

  const contentWidth = bounds.maxX - bounds.minX + 1;
  const contentHeight = bounds.maxY - bounds.minY + 1;
  const cropSize = Math.max(1, Math.min(maxSquareSize, Math.max(contentWidth, contentHeight)));
  const centerX = (bounds.minX + bounds.maxX + 1) / 2;
  const centerY = (bounds.minY + bounds.maxY + 1) / 2;
  const maxLeft = width - cropSize;
  const maxTop = height - cropSize;

  return {
    left: Math.max(0, Math.min(maxLeft, Math.round(centerX - cropSize / 2))),
    top: Math.max(0, Math.min(maxTop, Math.round(centerY - cropSize / 2))),
    size: cropSize,
  };
}

export type ManagedImagePreset =
  | "default"
  | "hero"
  | "special_page_hero"
  | "special_page_card"
  | "cover"
  | "generated_cover"
  | "generated_card"
  | "generated_pdf";

async function resizeSquareBufferToWebp(inputBuffer: Buffer, size: number) {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(inputBuffer)
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize(size, size, { fit: "fill" })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    throw new Error(`图片尺寸处理失败：${message}`);
  }
}

async function resizeHeroBufferToWebp(inputBuffer: Buffer) {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(inputBuffer)
      .rotate()
      .resize(HERO_IMAGE_MAX_SIZE_PX, HERO_IMAGE_MAX_SIZE_PX, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    throw new Error(`Hero 图片尺寸处理失败：${message}`);
  }
}

async function resizeRectangleBufferToWebp(inputBuffer: Buffer, width: number, height: number) {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(inputBuffer)
      .rotate()
      .flatten({ background: "#ffffff" })
      .resize(width, height, {
        fit: "cover",
        position: "center",
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    throw new Error(`图片尺寸处理失败：${message}`);
  }
}

async function convertImageToWebpBuffer(
  file: File,
  options?: { normalize?: boolean; preset?: ManagedImagePreset },
) {
  const arrayBuffer = await file.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  if (options?.preset === "cover") {
    return normalizeCoverUploadBufferToWebp(inputBuffer);
  }

  if (options?.preset === "hero") {
    return resizeHeroBufferToWebp(inputBuffer);
  }

  if (options?.preset === "special_page_hero") {
    return resizeRectangleBufferToWebp(
      inputBuffer,
      SPECIAL_PAGE_HERO_WIDTH_PX,
      SPECIAL_PAGE_HERO_HEIGHT_PX,
    );
  }

  if (options?.preset === "special_page_card") {
    return resizeSquareBufferToWebp(inputBuffer, SPECIAL_PAGE_CARD_SIZE_PX);
  }

  if (options?.preset === "generated_cover") {
    return resizeSquareBufferToWebp(inputBuffer, COVER_IMAGE_SIZE_PX);
  }

  if (options?.preset === "generated_card") {
    return resizeSquareBufferToWebp(inputBuffer, GENERATED_CARD_SIZE_PX);
  }

  if (options?.preset === "generated_pdf") {
    return resizeSquareBufferToWebp(inputBuffer, GENERATED_PDF_SIZE_PX);
  }

  return options?.normalize === false
    ? convertBufferToWebp(inputBuffer)
    : normalizeUploadBufferToWebp(inputBuffer);
}

export async function normalizeUploadBufferToWebp(inputBuffer: Buffer) {
  try {
    const sharp = (await import("sharp")).default;
    const orientedBuffer = await sharp(inputBuffer).rotate().toBuffer();
    const sourceImage = sharp(orientedBuffer);
    const metadata = await sourceImage.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (!width || !height) {
      throw new Error("无法读取原图尺寸。");
    }

    const baseSquareSize = Math.min(width, height);
    const baseSquareLeft = Math.floor((width - baseSquareSize) / 2);
    const baseSquareTop = Math.floor((height - baseSquareSize) / 2);
    const centeredSquareBuffer = await sharp(orientedBuffer)
      .extract({
        left: baseSquareLeft,
        top: baseSquareTop,
        width: baseSquareSize,
        height: baseSquareSize,
      })
      .toBuffer();
    const centeredSquareImage = sharp(centeredSquareBuffer);
    const { data: centeredSquareBitmap } = await centeredSquareImage
      .clone()
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const foregroundBounds = findForegroundBounds(
      centeredSquareBitmap,
      baseSquareSize,
      baseSquareSize,
    );
    const cropSize = foregroundBounds
      ? calculateCenteredSquareCropSize(foregroundBounds, baseSquareSize)
      : baseSquareSize;
    const cropInset = Math.floor((baseSquareSize - cropSize) / 2);

    // 普通大图上传：保留去白边后的有效尺寸，不再统一放大到固定像素，
    // 避免把 1024 一类源图硬拉伸后看起来更大但并没有更多细节。
    return centeredSquareImage
      .extract({
        left: cropInset,
        top: cropInset,
        width: cropSize,
        height: cropSize,
      })
      .flatten({ background: "#ffffff" })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    throw new Error(`图片预处理失败：${message}`);
  }
}

export async function normalizeCoverUploadBufferToWebp(inputBuffer: Buffer) {
  try {
    return await resizeSquareBufferToWebp(inputBuffer, COVER_IMAGE_SIZE_PX);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    throw new Error(`封面图预处理失败：${message}`);
  }
}

async function writePendingCategoryCoverSizes(id: string, inputBuffer: Buffer, fileName: string) {
  const savedFiles = await Promise.all(
    CATEGORY_IMAGE_SIZES.map(async (size) => {
      const relativePath = buildPendingCategoryImagePath(id, size);
      const webpBuffer = await resizeSquareBufferToWebp(inputBuffer, size);
      return [
        size,
        await writeManagedWebpFile(relativePath, webpBuffer, getCategoryImageFileName(id)),
      ] as const;
    }),
  );
  const bySize = new Map<CategoryImageSize, Awaited<ReturnType<typeof writeManagedWebpFile>>>(
    savedFiles,
  );
  return {
    ...bySize.get(COVER_IMAGE_SIZE_PX)!,
    file_name: toWebpFileName(fileName),
  };
}

async function convertBufferToWebp(inputBuffer: Buffer) {
  try {
    const sharp = (await import("sharp")).default;
    return await sharp(inputBuffer).rotate().webp({ quality: WEBP_QUALITY }).toBuffer();
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    throw new Error(`图片转 WebP 失败：${message}`);
  }
}

async function convertBufferWithPresetToWebp(
  inputBuffer: Buffer,
  options?: { normalize?: boolean; preset?: ManagedImagePreset },
) {
  if (options?.preset === "cover") {
    return normalizeCoverUploadBufferToWebp(inputBuffer);
  }

  if (options?.preset === "hero") {
    return resizeHeroBufferToWebp(inputBuffer);
  }

  if (options?.preset === "special_page_hero") {
    return resizeRectangleBufferToWebp(
      inputBuffer,
      SPECIAL_PAGE_HERO_WIDTH_PX,
      SPECIAL_PAGE_HERO_HEIGHT_PX,
    );
  }

  if (options?.preset === "special_page_card") {
    return resizeSquareBufferToWebp(inputBuffer, SPECIAL_PAGE_CARD_SIZE_PX);
  }

  if (options?.preset === "generated_cover") {
    return resizeSquareBufferToWebp(inputBuffer, COVER_IMAGE_SIZE_PX);
  }

  if (options?.preset === "generated_card") {
    return resizeSquareBufferToWebp(inputBuffer, GENERATED_CARD_SIZE_PX);
  }

  if (options?.preset === "generated_pdf") {
    return resizeSquareBufferToWebp(inputBuffer, GENERATED_PDF_SIZE_PX);
  }

  return options?.normalize === false
    ? convertBufferToWebp(inputBuffer)
    : normalizeUploadBufferToWebp(inputBuffer);
}

async function writeManagedWebpFile(relativePath: string, webpBuffer: Buffer, fileName: string) {
  const normalizedPath = normalizeRelativePath(relativePath);
  const absolutePath = resolveManagedFilePath(normalizedPath);

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, webpBuffer);

  return {
    local_file_path: normalizedPath,
    file_name: fileName,
    file_size: webpBuffer.length,
    file_type: "image/webp",
  };
}

function generateUniqueCategoryImageId() {
  return randomUUID();
}

export function resolveManagedFilePath(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath);
  const absolutePath = path.join(DATA_DIR, normalized);
  const relativeFromDataDir = path.relative(DATA_DIR, absolutePath);

  if (relativeFromDataDir.startsWith("..") || path.isAbsolute(relativeFromDataDir)) {
    throw new Error("本地文件路径无效。");
  }

  return absolutePath;
}

export async function stagePendingImageFile(file: File) {
  await ensureUploadDir();
  const relativePath = normalizeRelativePath(path.join("uploads", "pending", buildStagedFileName()));
  const webpBuffer = await convertImageToWebpBuffer(file);
  return writeManagedWebpFile(relativePath, webpBuffer, toWebpFileName(file.name));
}

export async function stagePendingImageFileWithPreset(
  file: File,
  options?: { normalize?: boolean; preset?: ManagedImagePreset },
) {
  await ensureUploadDir();
  const relativePath = normalizeRelativePath(path.join("uploads", "pending", buildStagedFileName()));
  const webpBuffer = await convertImageToWebpBuffer(file, options);
  return writeManagedWebpFile(relativePath, webpBuffer, toWebpFileName(file.name));
}

export async function stagePendingCategoryImageFile(
  file: File,
  options?: { normalize?: boolean; preset?: ManagedImagePreset },
) {
  await ensureUploadDir();
  const id = generateUniqueCategoryImageId();
  const relativePath = buildPendingCategoryImagePath(id);
  const inputBuffer = Buffer.from(await file.arrayBuffer());
  const savedFile =
    options?.preset === "cover"
      ? await writePendingCategoryCoverSizes(id, inputBuffer, file.name)
      : await writeManagedWebpFile(
          relativePath,
          await convertBufferWithPresetToWebp(inputBuffer, options),
          getCategoryImageFileName(id),
        );

  return {
    id,
    ...savedFile,
  };
}

export async function stagePendingCategoryImageBuffer(buffer: Buffer) {
  await ensureUploadDir();
  const id = generateUniqueCategoryImageId();
  const relativePath = buildPendingCategoryImagePath(id);
  const webpBuffer = await convertBufferToWebp(buffer);
  const savedFile = await writeManagedWebpFile(relativePath, webpBuffer, getCategoryImageFileName(id));

  return {
    id,
    ...savedFile,
  };
}

export async function stagePendingImageBuffer(
  buffer: Buffer,
  options?: { normalize?: boolean; preset?: ManagedImagePreset },
) {
  await ensureUploadDir();
  const relativePath = normalizeRelativePath(path.join("uploads", "pending", buildStagedFileName()));
  const webpBuffer = await convertBufferWithPresetToWebp(buffer, options);
  return writeManagedWebpFile(relativePath, webpBuffer, path.basename(relativePath));
}

export async function saveManagedImageFileAtPath(
  file: File,
  relativePath: string,
  options?: { normalize?: boolean; preset?: ManagedImagePreset },
) {
  const webpBuffer = await convertImageToWebpBuffer(file, options);
  return writeManagedWebpFile(relativePath, webpBuffer, path.basename(normalizeRelativePath(relativePath)));
}

export async function saveManagedImageBufferAtPath(
  buffer: Buffer,
  relativePath: string,
  options?: { normalize?: boolean; preset?: ManagedImagePreset },
) {
  const webpBuffer = await convertBufferWithPresetToWebp(buffer, options);
  return writeManagedWebpFile(relativePath, webpBuffer, path.basename(normalizeRelativePath(relativePath)));
}

export async function saveHomepageImageFile(file: File) {
  const objectKey = normalizeRelativePath(
    path.join("imgs", "site", "homepage", `${randomUUID()}.webp`),
  );
  const savedFile = await saveManagedImageFileAtPath(file, objectKey, { preset: "hero" });

  return {
    object_key: objectKey,
    ...savedFile,
  };
}

export async function saveSpecialPageImageFile(
  file: File,
  slug?: string | null,
  variant: "hero" | "card" = "hero",
) {
  const folderSlug = (slug?.trim() || "draft")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "draft";
  const objectKey = normalizeRelativePath(
    path.join("imgs", "special-pages", folderSlug, variant, `${randomUUID()}.webp`),
  );
  const savedFile = await saveManagedImageFileAtPath(
    file,
    objectKey,
    { preset: variant === "hero" ? "special_page_hero" : "special_page_card" },
  );

  return {
    object_key: objectKey,
    ...savedFile,
  };
}

export async function saveSpecialPageHeroImageFile(file: File, slug?: string | null) {
  return saveSpecialPageImageFile(file, slug, "hero");
}

export async function stagePendingHomepageImageFile(file: File) {
  await ensureUploadDir();
  const objectKey = normalizeRelativePath(
    path.join("imgs", "site", "homepage", `${randomUUID()}.webp`),
  );
  const relativePath = buildPendingHomepageImagePath(objectKey);
  const absolutePath = resolveManagedFilePath(relativePath);
  const webpBuffer = await convertImageToWebpBuffer(file, { normalize: false });

  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, webpBuffer);

  return {
    object_key: objectKey,
    local_file_path: relativePath,
    file_name: toWebpFileName(file.name),
    file_size: webpBuffer.length,
    file_type: "image/webp",
  };
}

export async function readManagedFile(relativePath: string) {
  return fs.readFile(resolveManagedFilePath(relativePath));
}

export async function hasManagedFile(relativePath?: string | null) {
  if (!relativePath) {
    return false;
  }

  try {
    await fs.access(resolveManagedFilePath(relativePath));
    return true;
  } catch {
    return false;
  }
}

export async function copyManagedFile(fromRelativePath: string, toRelativePath: string) {
  const fromAbsolutePath = resolveManagedFilePath(fromRelativePath);
  const toAbsolutePath = resolveManagedFilePath(toRelativePath);

  await fs.mkdir(path.dirname(toAbsolutePath), { recursive: true });
  await fs.copyFile(fromAbsolutePath, toAbsolutePath);
}

export async function deleteManagedFile(relativePath?: string | null) {
  if (!relativePath) {
    return;
  }

  await fs.rm(resolveManagedFilePath(relativePath), { force: true });
}

export async function listPendingManagedFiles() {
  await ensureUploadDir();
  const entries = await fs.readdir(PENDING_UPLOAD_DIR, { withFileTypes: true });
  const files = await Promise.all(
    entries
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const relativePath = normalizeRelativePath(path.join("uploads", "pending", entry.name));
        const stats = await fs.stat(resolveManagedFilePath(relativePath));

        return {
          relative_path: relativePath,
          modified_at_ms: stats.mtimeMs,
        };
      }),
  );

  return files;
}
