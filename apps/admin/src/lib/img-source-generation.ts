import { buildSmoothCutoutBuffer } from "@/lib/smooth-cutout";

const GRID_SIZE = 3;
const GRID_LINE_RATIO = 0.0032;
const STRIP_COUNT = 10;
const STRIP_FOOTER_RATIO = 0.11;
const STRIP_FONT_SEGMENT_RATIO = 0.8;
const STRIP_FONT_FOOTER_RATIO = 0.86;

export type ImgSourceKind = "outline" | "color" | "scene_color";
export type ImgGeneratedVariant = "coloring" | "tracing" | "cut" | "numbers" | "grid";

export const IMG_GENERATED_VARIANT_META: Record<
  ImgGeneratedVariant,
  {
    label: string;
    activeSlug: string;
  }
> = {
  coloring: {
    label: "涂色图",
    activeSlug: "coloring-pages",
  },
  tracing: {
    label: "描红图",
    activeSlug: "tracing-worksheets",
  },
  cut: {
    label: "剪纸图",
    activeSlug: "cut",
  },
  numbers: {
    label: "数字拼图",
    activeSlug: "number-sequencing",
  },
  grid: {
    label: "网格拼图",
    activeSlug: "grid-puzzles",
  },
};

const OUTLINE_VARIANTS: ImgGeneratedVariant[] = ["coloring", "tracing", "cut", "numbers", "grid"];
const COLOR_VARIANTS: ImgGeneratedVariant[] = ["cut"];
const SCENE_COLOR_VARIANTS: ImgGeneratedVariant[] = ["numbers", "grid"];
const DEFAULT_OUTLINE_VARIANTS: ImgGeneratedVariant[] = ["coloring", "tracing"];
const DEFAULT_COLOR_VARIANTS: ImgGeneratedVariant[] = ["cut"];
const DEFAULT_SCENE_COLOR_VARIANTS: ImgGeneratedVariant[] = ["numbers", "grid"];

function getGridSegments(total: number, count: number) {
  const segments: Array<{ start: number; size: number }> = [];

  for (let index = 0; index < count; index += 1) {
    const start = Math.round((total * index) / count);
    const end = Math.round((total * (index + 1)) / count);
    segments.push({ start, size: end - start });
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

async function getSharp() {
  return (await import("sharp")).default;
}

export async function renderContainedImageBuffer(
  inputBuffer: Buffer,
  width: number,
  height: number,
) {
  const sharp = await getSharp();
  return sharp(inputBuffer)
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize(width, height, { fit: "contain", background: "#ffffff" })
    .png()
    .toBuffer();
}

async function buildTracingBuffer(inputBuffer: Buffer, size: number) {
  const sharp = await getSharp();
  const prepared = await renderContainedImageBuffer(inputBuffer, size, size);
  const { data, info } = await sharp(prepared)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const nextData = Buffer.from(data);

  for (let index = 0; index < nextData.length; index += 4) {
    const alpha = nextData[index + 3];
    const isForeground =
      alpha >= 24 &&
      (alpha < 250 ||
        !(
          nextData[index] >= 245 &&
          nextData[index + 1] >= 245 &&
          nextData[index + 2] >= 245
        ));
    if (!isForeground) {
      continue;
    }

    nextData[index] = 204;
    nextData[index + 1] = 204;
    nextData[index + 2] = 204;
    nextData[index + 3] = 255;
  }

  return sharp(nextData, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

async function buildCutoutBuffer(inputBuffer: Buffer, size: number) {
  return buildSmoothCutoutBuffer(inputBuffer, size);
}

async function buildGridPuzzleBuffer(inputBuffer: Buffer, size: number) {
  const sharp = await getSharp();
  const prepared = await renderContainedImageBuffer(inputBuffer, size, size);
  const columnSegments = getGridSegments(size, GRID_SIZE);
  const rowSegments = getGridSegments(size, GRID_SIZE);
  const sourceTiles = rowSegments.flatMap((row) =>
    columnSegments.map((column) => ({
      left: column.start,
      top: row.start,
      width: column.size,
      height: row.size,
    })),
  );
  const shuffledTiles = shuffleArray(sourceTiles);
  const composites = await Promise.all(
    rowSegments.flatMap((row, rowIndex) =>
      columnSegments.map(async (column, columnIndex) => {
        const tileIndex = rowIndex * GRID_SIZE + columnIndex;
        const sourceTile = shuffledTiles[tileIndex];
        return {
          input: await sharp(prepared)
            .extract(sourceTile)
            .png()
            .toBuffer(),
          left: column.start,
          top: row.start,
        };
      }),
    ),
  );

  const lineWidth = Math.max(2, Math.round(size * GRID_LINE_RATIO));
  const gridLines = [
    ...columnSegments.slice(1).map(
      (segment) =>
        `<line x1="${segment.start}" y1="0" x2="${segment.start}" y2="${size}" stroke="#111111" stroke-width="${lineWidth}" />`,
    ),
    ...rowSegments.slice(1).map(
      (segment) =>
        `<line x1="0" y1="${segment.start}" x2="${size}" y2="${segment.start}" stroke="#111111" stroke-width="${lineWidth}" />`,
    ),
    `<rect x="${lineWidth / 2}" y="${lineWidth / 2}" width="${size - lineWidth}" height="${size - lineWidth}" fill="none" stroke="#111111" stroke-width="${lineWidth}" />`,
  ].join("");
  const overlaySvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${gridLines}</svg>`,
  );

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: "#ffffff",
    },
  })
    .composite([...composites, { input: overlaySvg, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

async function buildNumberPuzzleBuffer(inputBuffer: Buffer, size: number) {
  const sharp = await getSharp();
  const footerHeight = Math.max(96, Math.round(size * STRIP_FOOTER_RATIO));
  const contentHeight = size - footerHeight;
  const prepared = await renderContainedImageBuffer(inputBuffer, size, size);
  const strips = getGridSegments(size, STRIP_COUNT).map((segment, index) => ({
    sourceX: segment.start,
    sourceWidth: segment.size,
    originalIndex: index,
  }));
  const shuffledStrips = shuffleArray(strips);
  const targetSegments = getGridSegments(size, STRIP_COUNT);
  const composites = await Promise.all(
    targetSegments.map(async (segment, index) => {
      const strip = shuffledStrips[index];
      return {
        input: await sharp(prepared)
          .extract({
            left: strip.sourceX,
            top: 0,
            width: strip.sourceWidth,
            height: size,
          })
          .resize(segment.size, size)
          .png()
          .toBuffer(),
        left: segment.start,
        top: 0,
      };
    }),
  );

  const lineWidth = Math.max(2, Math.round(size * GRID_LINE_RATIO));
  const minSegmentWidth = Math.min(...targetSegments.map((segment) => segment.size));
  const fontSize = Math.max(
    42,
    Math.round(
      Math.min(
        minSegmentWidth * STRIP_FONT_SEGMENT_RATIO,
        footerHeight * STRIP_FONT_FOOTER_RATIO,
      ),
    ),
  );
  const overlaySvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <rect x="0" y="0" width="${size}" height="${size}" fill="none" />
      <rect x="0" y="${contentHeight}" width="${size}" height="${footerHeight}" fill="#ffffff" />
      ${targetSegments
        .map((segment, index) => {
          const strip = shuffledStrips[index];
          const centerX = segment.start + segment.size / 2;
          const centerY = contentHeight + footerHeight / 2;
          const verticalLine =
            index === 0
              ? ""
              : `<line x1="${segment.start}" y1="0" x2="${segment.start}" y2="${size}" stroke="#111111" stroke-width="${lineWidth}" />`;
          return `${verticalLine}<text x="${centerX}" y="${centerY}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="#111111">${strip.originalIndex + 1}</text>`;
        })
        .join("")}
      <line x1="${size}" y1="0" x2="${size}" y2="${size}" stroke="#111111" stroke-width="${lineWidth}" />
      <line x1="0" y1="${contentHeight}" x2="${size}" y2="${contentHeight}" stroke="#111111" stroke-width="${lineWidth}" />
    </svg>`,
  );

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: "#ffffff",
    },
  })
    .composite([...composites, { input: overlaySvg, left: 0, top: 0 }])
    .png()
    .toBuffer();
}

export function getAvailableGeneratedVariants(sourceKind: ImgSourceKind) {
  if (sourceKind === "outline") {
    return OUTLINE_VARIANTS;
  }
  return sourceKind === "scene_color" ? SCENE_COLOR_VARIANTS : COLOR_VARIANTS;
}

// 默认生成策略按原始图类型拆分，避免线框图和彩图同时产出重复功能图。
export function getDefaultGeneratedVariants(sourceKind: ImgSourceKind) {
  if (sourceKind === "outline") {
    return DEFAULT_OUTLINE_VARIANTS;
  }
  return sourceKind === "scene_color" ? DEFAULT_SCENE_COLOR_VARIANTS : DEFAULT_COLOR_VARIANTS;
}

export async function buildGeneratedImgBuffer(options: {
  sourceBuffer: Buffer;
  sourceKind: ImgSourceKind;
  variant: ImgGeneratedVariant;
  size: number;
}) {
  if (options.variant === "coloring") {
    if (options.sourceKind !== "outline") {
      throw new Error("彩图原始图不支持生成涂色图。");
    }

    return renderContainedImageBuffer(options.sourceBuffer, options.size, options.size);
  }

  if (options.variant === "tracing") {
    if (options.sourceKind !== "outline") {
      throw new Error("彩图原始图不支持生成描红图。");
    }

    return buildTracingBuffer(options.sourceBuffer, options.size);
  }

  if (options.variant === "cut") {
    return buildCutoutBuffer(options.sourceBuffer, options.size);
  }

  if (options.variant === "numbers") {
    return buildNumberPuzzleBuffer(options.sourceBuffer, options.size);
  }

  if (options.variant === "grid") {
    return buildGridPuzzleBuffer(options.sourceBuffer, options.size);
  }

  throw new Error("不支持的生成功能。");
}
