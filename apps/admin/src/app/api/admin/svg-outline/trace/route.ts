import { NextResponse } from "next/server";

import {
  buildLayeredVectorSvg,
  extractSvgPathTags,
  parseSvgMetadata,
} from "@/lib/svg-outline";
import { runVectorTracerSerially } from "@/lib/vectortracer-lock";

export const runtime = "nodejs";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/bmp"]);
const MAX_VECTOR_COLORS = 8;
const COLOR_BUCKET_SIZE = 32;
const MIN_LAYER_PIXEL_RATIO = 0.003;
const MIN_LAYER_PIXELS = 24;

type LoadedBitmapImage = {
  bitmap?: {
    width: number;
    height: number;
    data: Buffer;
  };
};

function isAcceptedImage(file: File) {
  if (ACCEPTED_TYPES.has(file.type)) {
    return true;
  }

  return /\.(png|jpe?g|bmp)$/i.test(file.name);
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function colorDistance(a: [number, number, number], b: [number, number, number]) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function quantizeChannel(value: number) {
  return Math.min(255, Math.floor(value / COLOR_BUCKET_SIZE) * COLOR_BUCKET_SIZE);
}

async function loadJimpImage(fileBuffer: Buffer) {
  return (async () => {
    const jimpModule = await import("jimp");
    const Jimp = jimpModule.Jimp as {
      read: (input: Buffer) => Promise<LoadedBitmapImage>;
    };

    return Jimp.read(fileBuffer);
  })();
}

function pickPalette(bitmap: Buffer, width: number, height: number) {
  const buckets = new Map<string, { count: number; sumR: number; sumG: number; sumB: number }>();

  for (let idx = 0; idx < bitmap.length; idx += 4) {
    const alpha = bitmap[idx + 3];
    if (alpha < 16) {
      continue;
    }

    const r = bitmap[idx];
    const g = bitmap[idx + 1];
    const b = bitmap[idx + 2];
    const key = `${quantizeChannel(r)}-${quantizeChannel(g)}-${quantizeChannel(b)}`;
    const bucket = buckets.get(key) ?? { count: 0, sumR: 0, sumG: 0, sumB: 0 };
    bucket.count += 1;
    bucket.sumR += r;
    bucket.sumG += g;
    bucket.sumB += b;
    buckets.set(key, bucket);
  }

  const minimumPixels = Math.max(MIN_LAYER_PIXELS, Math.floor(width * height * MIN_LAYER_PIXEL_RATIO));

  const palette = Array.from(buckets.values())
    .filter((bucket) => bucket.count >= minimumPixels)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_VECTOR_COLORS)
    .map((bucket) => ({
      rgb: [
        bucket.sumR / bucket.count,
        bucket.sumG / bucket.count,
        bucket.sumB / bucket.count,
      ] as [number, number, number],
      count: bucket.count,
    }));

  if (palette.length > 0) {
    return palette;
  }

  let count = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;

  for (let idx = 0; idx < bitmap.length; idx += 4) {
    const alpha = bitmap[idx + 3];
    if (alpha < 16) {
      continue;
    }
    sumR += bitmap[idx];
    sumG += bitmap[idx + 1];
    sumB += bitmap[idx + 2];
    count += 1;
  }

  if (count === 0) {
    return [];
  }

  return [
    {
      rgb: [sumR / count, sumG / count, sumB / count] as [number, number, number],
      count,
    },
  ];
}

function assignPixelsToPalette(bitmap: Buffer, palette: Array<{ rgb: [number, number, number] }>) {
  const masks = palette.map(() => new Uint8Array(bitmap.length / 4));
  const counts = palette.map(() => 0);

  for (let idx = 0, pixelIndex = 0; idx < bitmap.length; idx += 4, pixelIndex += 1) {
    const alpha = bitmap[idx + 3];
    if (alpha < 16) {
      continue;
    }

    const pixel: [number, number, number] = [bitmap[idx], bitmap[idx + 1], bitmap[idx + 2]];
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let paletteIndex = 0; paletteIndex < palette.length; paletteIndex += 1) {
      const distance = colorDistance(pixel, palette[paletteIndex].rgb);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = paletteIndex;
      }
    }

    masks[bestIndex][pixelIndex] = 1;
    counts[bestIndex] += 1;
  }

  return { masks, counts };
}

function buildMaskBitmap(mask: Uint8Array, width: number, height: number) {
  const bitmap = Buffer.alloc(width * height * 4, 255);

  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) {
      continue;
    }
    const offset = index * 4;
    bitmap[offset] = 0;
    bitmap[offset + 1] = 0;
    bitmap[offset + 2] = 0;
    bitmap[offset + 3] = 255;
  }

  return bitmap;
}

async function traceMaskPath(mask: Uint8Array, width: number, height: number, color: string) {
  return runVectorTracerSerially(async () => {
    const { BinaryImageConverter } = await import("vectortracer");
    const imageData = {
      data: new Uint8ClampedArray(buildMaskBitmap(mask, width, height)),
      width,
      height,
    };
    const converter = new BinaryImageConverter(
      imageData as ImageData,
      {
        debug: false,
        mode: "spline",
        cornerThreshold: 60,
        lengthThreshold: 4,
        maxIterations: 10,
        spliceThreshold: 45,
        filterSpeckle: 4,
        pathPrecision: 2,
      },
      {
        invert: false,
        pathFill: color,
        backgroundColor: "transparent",
        attributes: "",
        scale: 1,
      },
    );

    try {
      converter.init();
      let done = false;

      while (!done) {
        done = converter.tick();
      }

      const svg = converter.getResult();
      return extractSvgPathTags(svg).join("\n");
    } finally {
      converter.free();
    }
  });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: "请选择要转换的图片文件。" }, { status: 400 });
    }

    if (!isAcceptedImage(file)) {
      return NextResponse.json(
        { error: "暂只支持 PNG、JPG、JPEG、BMP 图片。" },
        { status: 400 },
      );
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const image = await loadJimpImage(fileBuffer);
    const width = image.bitmap?.width ?? 0;
    const height = image.bitmap?.height ?? 0;
    const bitmap = image.bitmap?.data;

    if (!bitmap || !width || !height) {
      throw new Error("无法读取图片像素数据。");
    }

    const palette = pickPalette(bitmap, width, height);
    const { masks, counts } = assignPixelsToPalette(bitmap, palette);

    const tracedLayers: Array<{
      color: string;
      count: number;
      pathTag: string;
    }> = [];

    // vectortracer 的 wasm 绑定在并发调用时可能触发 Rust 的别名安全检查，这里改为串行追踪。
    for (let index = 0; index < palette.length; index += 1) {
      const entry = palette[index];
      const color = rgbToHex(entry.rgb[0], entry.rgb[1], entry.rgb[2]);
      const pathTag = await traceMaskPath(masks[index], width, height, color);

      tracedLayers.push({
        color,
        count: counts[index],
        pathTag,
      });
    }

    const layers = tracedLayers.filter((layer) => layer.count > 0 && layer.pathTag);

    const svg = buildLayeredVectorSvg({
      width,
      height,
      layers,
    });

    return NextResponse.json({
      svg,
      metadata: parseSvgMetadata(svg),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "图片转 SVG 失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
