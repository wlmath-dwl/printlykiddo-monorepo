"use client";

import type { ActiveListItem, ImgListItem, ImgSourceListItem } from "@/lib/admin-types";
import {
  buildForegroundMask as buildSmoothForegroundMask,
  chaikinSmooth,
  detectModeFromCornerAlpha,
  extractContour,
  getSmoothCutoutPadding,
  simplifyByDistance,
  SMOOTH_CUTOUT_TEST_DEFAULTS,
} from "@/lib/smooth-cutout-core";

const FOREGROUND_ALPHA_THRESHOLD = 24;
const WHITE_BACKGROUND_THRESHOLD = 245;
const PUZZLE_GRID_SIZE = 3;
const PUZZLE_GRID_LINE_WIDTH = 4;
const PUZZLE_GRID_LINE_COLOR = "#111111";
const STRIP_PUZZLE_COUNT = 10;
const STRIP_PUZZLE_FOOTER_HEIGHT = 84;
const STRIP_PUZZLE_LINE_WIDTH = 3;
const STRIP_PUZZLE_LINE_COLOR = "#111111";
const STRIP_PUZZLE_TEXT_COLOR = "#111111";
const STRIP_PUZZLE_TEXT_SEGMENT_RATIO = 0.8;
const STRIP_PUZZLE_TEXT_FOOTER_RATIO = 0.86;
const TRACING_STROKE_COLOR = "#CCCCCC";

export type CategoryCutoutRenderOptions = {
  [Key in keyof typeof SMOOTH_CUTOUT_TEST_DEFAULTS]?: number;
};

export const CATEGORY_CUTOUT_RENDER_DEFAULTS = SMOOTH_CUTOUT_TEST_DEFAULTS;

function isForegroundPixel(r: number, g: number, b: number, a: number) {
  if (a < FOREGROUND_ALPHA_THRESHOLD) {
    return false;
  }

  if (a < 250) {
    return true;
  }

  return !(r >= WHITE_BACKGROUND_THRESHOLD && g >= WHITE_BACKGROUND_THRESHOLD && b >= WHITE_BACKGROUND_THRESHOLD);
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function loadImageElement(url: string) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("读取原图失败。");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = new window.Image();
    image.decoding = "async";

    const loaded = new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("浏览器加载原图失败。"));
    });

    image.src = objectUrl;
    return await loaded;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function dilateMaskViaBlur(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("浏览器不支持当前画布上下文。");
  }

  const imageData = context.createImageData(width, height);
  for (let index = 0; index < width * height; index += 1) {
    if (!mask[index]) {
      continue;
    }

    imageData.data[index * 4] = 0;
    imageData.data[index * 4 + 1] = 0;
    imageData.data[index * 4 + 2] = 0;
    imageData.data[index * 4 + 3] = 255;
  }
  context.putImageData(imageData, 0, 0);

  const blurCanvas = document.createElement("canvas");
  blurCanvas.width = width;
  blurCanvas.height = height;
  const blurContext = blurCanvas.getContext("2d");

  if (!blurContext) {
    throw new Error("浏览器不支持当前画布上下文。");
  }

  blurContext.filter = `blur(${radius}px)`;
  blurContext.drawImage(canvas, 0, 0);

  const blurred = blurContext.getImageData(0, 0, width, height).data;
  const result = new Uint8Array(width * height);
  for (let index = 0; index < width * height; index += 1) {
    result[index] = blurred[index * 4 + 3] > 2 ? 1 : 0;
  }

  return result;
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("浏览器导出剪纸图失败。"));
        return;
      }

      resolve(blob);
    }, type, quality);
  });
}

function getBaseFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "") || "category-image";
}

function getCutoutSourceDisplayName(record: ImgSourceListItem) {
  return (
    record.local_file_path?.trim() ||
    record.title?.trim() ||
    record.prompt_group?.trim() ||
    "generated"
  );
}

export function buildCategoryCutoutSourcePreviewUrl(record: Pick<ImgSourceListItem, "image_url">) {
  if (!record.image_url?.trim()) {
    return null;
  }

  const searchParams = new URLSearchParams();
  searchParams.set("path", record.image_url.trim());
  return `/api/admin/img-sources/preview?${searchParams.toString()}`;
}

export async function uploadGeneratedCategoryImgFile(
  record: Pick<
    ImgListItem,
    | "id"
    | "category_id"
    | "active_id"
    | "title"
    | "slug"
    | "description"
    | "difficulty"
    | "sort_order"
    | "is_active"
  >,
  file: File,
) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category_id", String(record.category_id));
  formData.append("active_id", String(record.active_id));

  const uploadResponse = await fetch("/api/admin/imgs/upload", {
    method: "POST",
    body: formData,
  });
  const uploadData = (await uploadResponse.json()) as
    | {
        image_url: string;
        image_url_card: string;
        local_file_path: string;
        local_file_path_card: string;
      }
    | { error?: string };

  if (
    !uploadResponse.ok ||
    !("image_url" in uploadData) ||
    !("image_url_card" in uploadData) ||
    !("local_file_path" in uploadData) ||
    !("local_file_path_card" in uploadData)
  ) {
    throw new Error("error" in uploadData ? uploadData.error : "上传功能图失败。");
  }

  const response = await fetch(`/api/admin/imgs/${record.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category_id: record.category_id,
      active_id: record.active_id,
      image_url: uploadData.image_url,
      image_url_card: uploadData.image_url_card,
      local_file_path: uploadData.local_file_path,
      local_file_path_card: uploadData.local_file_path_card,
      title: record.title,
      slug: record.slug,
      description: record.description,
      difficulty: record.difficulty,
      sort_order: record.sort_order,
      is_active: record.is_active,
    }),
  });
  const data = (await response.json()) as { error?: string };

  if (!response.ok || "error" in data) {
    throw new Error("error" in data ? data.error : "保存功能图失败。");
  }
}

export async function replaceGeneratedCutImgsWithClientOutput(options: {
  generatedItems: Array<
    Pick<
      ImgListItem,
      | "id"
      | "category_id"
      | "active_id"
      | "title"
      | "slug"
      | "description"
      | "difficulty"
      | "sort_order"
      | "is_active"
    >
  >;
  sources: ImgSourceListItem[];
  actives: ActiveListItem[];
}) {
  const cutActiveIds = new Set(
    options.actives.filter((active) => active.slug === "cut").map((active) => active.id),
  );

  if (cutActiveIds.size === 0) {
    return 0;
  }

  const generatedCutItems = options.generatedItems.filter((item) => cutActiveIds.has(item.active_id));
  if (generatedCutItems.length === 0) {
    return 0;
  }

  const sourceByGeneratedImgId = new Map<number, ImgSourceListItem>();
  options.sources.forEach((source) => {
    source.generated_img_ids.forEach((imgId) => {
      sourceByGeneratedImgId.set(imgId, source);
    });
  });

  let replacedCount = 0;

  for (const item of generatedCutItems) {
    const source = sourceByGeneratedImgId.get(item.id);
    if (!source) {
      continue;
    }

    const sourceUrl = buildCategoryCutoutSourcePreviewUrl(source);
    if (!sourceUrl) {
      continue;
    }

    const file = await generateCategoryCutoutFile({
      sourceUrl,
      sourceName: getCutoutSourceDisplayName(source),
      variant: "cut_color",
    });
    await uploadGeneratedCategoryImgFile(item, file);
    replacedCount += 1;
  }

  return replacedCount;
}

function getGridSegments(total: number, count: number) {
  const segments: Array<{ start: number; size: number }> = [];

  for (let index = 0; index < count; index += 1) {
    const start = Math.round((total * index) / count);
    const end = Math.round((total * (index + 1)) / count);
    segments.push({
      start,
      size: end - start,
    });
  }

  return segments;
}

function shuffleArray<T>(items: T[]) {
  const nextItems = [...items];

  for (let index = nextItems.length - 1; index > 0; index -= 1) {
    const nextIndex = Math.floor(Math.random() * (index + 1));
    [nextItems[index], nextItems[nextIndex]] = [nextItems[nextIndex], nextItems[index]];
  }

  return nextItems;
}

function drawVerticalLine(
  context: CanvasRenderingContext2D,
  x: number,
  startY: number,
  endY: number,
  lineWidth: number,
  color: string,
) {
  context.beginPath();
  context.moveTo(x, startY);
  context.lineTo(x, endY);
  context.lineWidth = lineWidth;
  context.strokeStyle = color;
  context.stroke();
}

function drawHorizontalLine(
  context: CanvasRenderingContext2D,
  y: number,
  startX: number,
  endX: number,
  lineWidth: number,
  color: string,
) {
  context.beginPath();
  context.moveTo(startX, y);
  context.lineTo(endX, y);
  context.lineWidth = lineWidth;
  context.strokeStyle = color;
  context.stroke();
}

export async function generateCategoryCutoutFile(options: {
  sourceUrl: string;
  sourceName: string;
  variant: "cut_line" | "cut_color";
  renderOptions?: CategoryCutoutRenderOptions;
}) {
  const config = {
    ...CATEGORY_CUTOUT_RENDER_DEFAULTS,
    ...options.renderOptions,
  };
  const image = await loadImageElement(options.sourceUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (!width || !height) {
    throw new Error("原图尺寸无效。");
  }

  const sourceCanvas = createCanvas(width, height);
  const sourceContext = sourceCanvas.getContext("2d", { willReadFrequently: true });

  if (!sourceContext) {
    throw new Error("浏览器不支持当前画布上下文。");
  }

  sourceContext.drawImage(image, 0, 0, width, height);
  const imageData = sourceContext.getImageData(0, 0, width, height);
  const detection = detectModeFromCornerAlpha(
    imageData.data,
    width,
    height,
    config,
  );
  const foregroundMask = buildSmoothForegroundMask(
    imageData.data,
    width,
    height,
    detection.mode,
    detection.threshold,
  );

  if (!foregroundMask.some(Boolean)) {
    throw new Error("当前图片未识别到可生成剪纸线的主体区域。");
  }

  const dilatedMask = dilateMaskViaBlur(foregroundMask, width, height, config.offset);
  const loops = extractContour(dilatedMask, width, height)
    .map((loop) => simplifyByDistance(loop, config.simplifyTolerance))
    .map((loop) => chaikinSmooth(loop, config.smoothIterations))
    .filter((loop) => loop.length >= 3);
  const padding = getSmoothCutoutPadding(
    config.offset,
    config.strokeWidth,
    config.dashGap,
  );

  if (loops.length === 0) {
    throw new Error("当前图片未生成有效的剪纸外轮廓。");
  }

  const outputCanvas = createCanvas(width + padding * 2, height + padding * 2);
  const outputContext = outputCanvas.getContext("2d");

  if (!outputContext) {
    throw new Error("浏览器不支持当前画布上下文。");
  }

  outputContext.fillStyle = "#ffffff";
  outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  outputContext.drawImage(sourceCanvas, padding, padding);
  outputContext.strokeStyle = "#111111";
  outputContext.lineWidth = config.strokeWidth;
  outputContext.lineJoin = "round";
  outputContext.lineCap = "round";
  outputContext.setLineDash([config.dashLength, config.dashGap]);

  loops.forEach((loop) => {
    outputContext.beginPath();
    outputContext.moveTo(loop[0].x + padding, loop[0].y + padding);

    for (let index = 1; index < loop.length; index += 1) {
      outputContext.lineTo(loop[index].x + padding, loop[index].y + padding);
    }

    outputContext.closePath();
    outputContext.stroke();
  });

  const blob = await canvasToBlob(outputCanvas, "image/png");
  const suffix = options.variant === "cut_line" ? "cut-line" : "cut-color";

  return new File([blob], `${getBaseFileName(options.sourceName)}-${suffix}.png`, {
    type: "image/png",
    lastModified: Date.now(),
  });
}

export async function generateCategoryColoringFile(options: {
  sourceUrl: string;
  sourceName: string;
}) {
  const image = await loadImageElement(options.sourceUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (!width || !height) {
    throw new Error("原图尺寸无效。");
  }

  const outputCanvas = createCanvas(width, height);
  const outputContext = outputCanvas.getContext("2d");

  if (!outputContext) {
    throw new Error("浏览器不支持当前画布上下文。");
  }

  outputContext.fillStyle = "#ffffff";
  outputContext.fillRect(0, 0, width, height);
  outputContext.drawImage(image, 0, 0, width, height);

  const blob = await canvasToBlob(outputCanvas, "image/png");
  return new File([blob], `${getBaseFileName(options.sourceName)}-coloring.png`, {
    type: "image/png",
    lastModified: Date.now(),
  });
}

export async function generateCategoryTracingFile(options: {
  sourceUrl: string;
  sourceName: string;
}) {
  const image = await loadImageElement(options.sourceUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (!width || !height) {
    throw new Error("原图尺寸无效。");
  }

  const outputCanvas = createCanvas(width, height);
  const outputContext = outputCanvas.getContext("2d", { willReadFrequently: true });

  if (!outputContext) {
    throw new Error("浏览器不支持当前画布上下文。");
  }

  outputContext.fillStyle = "#ffffff";
  outputContext.fillRect(0, 0, width, height);
  outputContext.drawImage(image, 0, 0, width, height);

  const imageData = outputContext.getImageData(0, 0, width, height);
  const strokeColor = TRACING_STROKE_COLOR.match(/[0-9a-f]{2}/gi)?.map((value) => Number.parseInt(value, 16));

  if (!strokeColor || strokeColor.length !== 3) {
    throw new Error("描线图颜色配置无效。");
  }

  for (let index = 0; index < imageData.data.length; index += 4) {
    const alpha = imageData.data[index + 3];
    if (!isForegroundPixel(imageData.data[index], imageData.data[index + 1], imageData.data[index + 2], alpha)) {
      continue;
    }

    imageData.data[index] = strokeColor[0];
    imageData.data[index + 1] = strokeColor[1];
    imageData.data[index + 2] = strokeColor[2];
    imageData.data[index + 3] = alpha;
  }

  outputContext.putImageData(imageData, 0, 0);

  const blob = await canvasToBlob(outputCanvas, "image/png");
  return new File([blob], `${getBaseFileName(options.sourceName)}-tracing.png`, {
    type: "image/png",
    lastModified: Date.now(),
  });
}

export async function generateCategoryPuzzleFile(options: {
  sourceUrl: string;
  sourceName: string;
  variant: "puzzle_line" | "puzzle_color";
}) {
  const image = await loadImageElement(options.sourceUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (!width || !height) {
    throw new Error("原图尺寸无效。");
  }

  const sourceCanvas = createCanvas(width, height);
  const sourceContext = sourceCanvas.getContext("2d");

  if (!sourceContext) {
    throw new Error("浏览器不支持当前画布上下文。");
  }

  sourceContext.drawImage(image, 0, 0, width, height);

  const columnSegments = getGridSegments(width, PUZZLE_GRID_SIZE);
  const rowSegments = getGridSegments(height, PUZZLE_GRID_SIZE);
  const sourceTiles = rowSegments.flatMap((row) =>
    columnSegments.map((column) => ({
      sx: column.start,
      sy: row.start,
      sw: column.size,
      sh: row.size,
    })),
  );
  const shuffledTiles = shuffleArray(sourceTiles);
  const outputCanvas = createCanvas(width, height);
  const outputContext = outputCanvas.getContext("2d");

  if (!outputContext) {
    throw new Error("浏览器不支持当前画布上下文。");
  }

  rowSegments.forEach((row, rowIndex) => {
    columnSegments.forEach((column, columnIndex) => {
      const tileIndex = rowIndex * PUZZLE_GRID_SIZE + columnIndex;
      const sourceTile = shuffledTiles[tileIndex];

      outputContext.drawImage(
        sourceCanvas,
        sourceTile.sx,
        sourceTile.sy,
        sourceTile.sw,
        sourceTile.sh,
        column.start,
        row.start,
        column.size,
        row.size,
      );
    });
  });

  outputContext.strokeStyle = PUZZLE_GRID_LINE_COLOR;
  outputContext.lineWidth = PUZZLE_GRID_LINE_WIDTH;
  outputContext.lineJoin = "miter";
  outputContext.lineCap = "square";

  for (let index = 1; index < PUZZLE_GRID_SIZE; index += 1) {
    const x = columnSegments[index].start;
    outputContext.beginPath();
    outputContext.moveTo(x, 0);
    outputContext.lineTo(x, height);
    outputContext.stroke();
  }

  for (let index = 1; index < PUZZLE_GRID_SIZE; index += 1) {
    const y = rowSegments[index].start;
    outputContext.beginPath();
    outputContext.moveTo(0, y);
    outputContext.lineTo(width, y);
    outputContext.stroke();
  }

  const outlineInset = PUZZLE_GRID_LINE_WIDTH / 2;
  outputContext.strokeRect(
    outlineInset,
    outlineInset,
    width - PUZZLE_GRID_LINE_WIDTH,
    height - PUZZLE_GRID_LINE_WIDTH,
  );

  const blob = await canvasToBlob(outputCanvas, "image/png");
  const suffix = options.variant === "puzzle_line" ? "puzzle-line" : "puzzle-color";

  return new File([blob], `${getBaseFileName(options.sourceName)}-${suffix}.png`, {
    type: "image/png",
    lastModified: Date.now(),
  });
}

export async function generateCategoryStripPuzzleFile(options: {
  sourceUrl: string;
  sourceName: string;
  variant: "strip_puzzle_line" | "strip_puzzle_color";
}) {
  const image = await loadImageElement(options.sourceUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (!width || !height) {
    throw new Error("原图尺寸无效。");
  }

  const sourceCanvas = createCanvas(width, height);
  const sourceContext = sourceCanvas.getContext("2d");

  if (!sourceContext) {
    throw new Error("浏览器不支持当前画布上下文。");
  }

  sourceContext.drawImage(image, 0, 0, width, height);

  const strips = getGridSegments(width, STRIP_PUZZLE_COUNT).map((segment, index) => ({
    sourceX: segment.start,
    sourceWidth: segment.size,
    originalIndex: index,
  }));
  const shuffledStrips = shuffleArray(strips);
  const outputCanvas = createCanvas(width, height + STRIP_PUZZLE_FOOTER_HEIGHT);
  const outputContext = outputCanvas.getContext("2d");

  if (!outputContext) {
    throw new Error("浏览器不支持当前画布上下文。");
  }

  outputContext.fillStyle = "#ffffff";
  outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);

  const targetSegments = getGridSegments(width, STRIP_PUZZLE_COUNT);
  const minSegmentWidth = Math.min(...targetSegments.map((segment) => segment.size));
  const numberFontSize = Math.max(
    36,
    Math.round(
      Math.min(
        minSegmentWidth * STRIP_PUZZLE_TEXT_SEGMENT_RATIO,
        STRIP_PUZZLE_FOOTER_HEIGHT * STRIP_PUZZLE_TEXT_FOOTER_RATIO,
      ),
    ),
  );

  targetSegments.forEach((segment, index) => {
    const strip = shuffledStrips[index];
    outputContext.drawImage(
      sourceCanvas,
      strip.sourceX,
      0,
      strip.sourceWidth,
      height,
      segment.start,
      0,
      segment.size,
      height,
    );
  });

  outputContext.fillStyle = "#ffffff";
  outputContext.fillRect(0, height, width, STRIP_PUZZLE_FOOTER_HEIGHT);

  drawVerticalLine(
    outputContext,
    0,
    0,
    outputCanvas.height,
    STRIP_PUZZLE_LINE_WIDTH,
    STRIP_PUZZLE_LINE_COLOR,
  );

  targetSegments.forEach((segment, index) => {
    if (index > 0) {
      drawVerticalLine(
        outputContext,
        segment.start,
        0,
        outputCanvas.height,
        STRIP_PUZZLE_LINE_WIDTH,
        STRIP_PUZZLE_LINE_COLOR,
      );
    }

    const strip = shuffledStrips[index];
    const centerX = segment.start + segment.size / 2;
    const centerY = height + STRIP_PUZZLE_FOOTER_HEIGHT / 2;

    outputContext.fillStyle = STRIP_PUZZLE_TEXT_COLOR;
    outputContext.font = `bold ${numberFontSize}px Arial`;
    outputContext.textAlign = "center";
    outputContext.textBaseline = "middle";
    outputContext.fillText(String(strip.originalIndex + 1), centerX, centerY);
  });

  drawVerticalLine(
    outputContext,
    width,
    0,
    outputCanvas.height,
    STRIP_PUZZLE_LINE_WIDTH,
    STRIP_PUZZLE_LINE_COLOR,
  );
  drawHorizontalLine(
    outputContext,
    height,
    0,
    width,
    STRIP_PUZZLE_LINE_WIDTH,
    STRIP_PUZZLE_LINE_COLOR,
  );

  const blob = await canvasToBlob(outputCanvas, "image/png");
  const suffix =
    options.variant === "strip_puzzle_line"
      ? "strip-puzzle-line"
      : "strip-puzzle-color";

  return new File([blob], `${getBaseFileName(options.sourceName)}-${suffix}.png`, {
    type: "image/png",
    lastModified: Date.now(),
  });
}
