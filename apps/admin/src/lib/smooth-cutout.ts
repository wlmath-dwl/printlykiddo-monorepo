import {
  buildForegroundMask,
  chaikinSmooth,
  detectModeFromCornerAlpha,
  extractContour,
  getSmoothCutoutPadding,
  type Point,
  simplifyByDistance,
  SMOOTH_CUTOUT_GENERATED_DEFAULTS,
} from "@/lib/smooth-cutout-core";

type SmoothCutoutOptions = {
  size: number;
  offset: number;
  simplifyTolerance: number;
  smoothIterations: number;
  dashLength: number;
  dashGap: number;
  strokeWidth: number;
  alphaThreshold: number;
  luminanceThreshold: number;
};

const GENERATED_CUTOUT_OPTIONS: SmoothCutoutOptions = {
  size: 1280,
  ...SMOOTH_CUTOUT_GENERATED_DEFAULTS,
};

async function dilateMaskViaBlur(mask: Uint8Array, width: number, height: number, radius: number) {
  if (radius <= 0) {
    return new Uint8Array(mask);
  }

  const sharp = (await import("sharp")).default;
  const gray = Buffer.alloc(width * height);

  for (let index = 0; index < mask.length; index += 1) {
    gray[index] = mask[index] ? 255 : 0;
  }

  const blurred = await sharp(gray, {
    raw: { width, height, channels: 1 },
  })
    .blur(Math.max(0.6, radius / 2))
    .raw()
    .toBuffer({ resolveWithObject: true });

  const result = new Uint8Array(width * height);
  // sharp may expand raw grayscale output to multiple channels after blur.
  const blurredChannels = Math.max(1, blurred.info.channels || 1);
  for (let index = 0; index < result.length; index += 1) {
    result[index] = blurred.data[index * blurredChannels] > 2 ? 1 : 0;
  }

  return result;
}

function blendPixel(
  buffer: Buffer,
  width: number,
  height: number,
  x: number,
  y: number,
  color: [number, number, number, number],
) {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }

  const offset = (y * width + x) * 4;
  const sourceAlpha = color[3] / 255;
  const targetAlpha = buffer[offset + 3] / 255;
  const outAlpha = sourceAlpha + targetAlpha * (1 - sourceAlpha);

  if (outAlpha <= 0) {
    buffer[offset] = 0;
    buffer[offset + 1] = 0;
    buffer[offset + 2] = 0;
    buffer[offset + 3] = 0;
    return;
  }

  buffer[offset] = Math.round(
    (color[0] * sourceAlpha + buffer[offset] * targetAlpha * (1 - sourceAlpha)) / outAlpha,
  );
  buffer[offset + 1] = Math.round(
    (color[1] * sourceAlpha + buffer[offset + 1] * targetAlpha * (1 - sourceAlpha)) / outAlpha,
  );
  buffer[offset + 2] = Math.round(
    (color[2] * sourceAlpha + buffer[offset + 2] * targetAlpha * (1 - sourceAlpha)) / outAlpha,
  );
  buffer[offset + 3] = Math.round(outAlpha * 255);
}

function drawFilledCircle(
  buffer: Buffer,
  width: number,
  height: number,
  centerX: number,
  centerY: number,
  radius: number,
  color: [number, number, number, number],
) {
  const minX = Math.max(0, Math.floor(centerX - radius));
  const maxX = Math.min(width - 1, Math.ceil(centerX + radius));
  const minY = Math.max(0, Math.floor(centerY - radius));
  const maxY = Math.min(height - 1, Math.ceil(centerY + radius));
  const radiusSquared = radius * radius;

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x + 0.5 - centerX;
      const dy = y + 0.5 - centerY;
      if (dx * dx + dy * dy <= radiusSquared) {
        blendPixel(buffer, width, height, x, y, color);
      }
    }
  }
}

function drawStrokeSegment(
  buffer: Buffer,
  width: number,
  height: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  strokeWidth: number,
  color: [number, number, number, number],
) {
  const length = Math.hypot(endX - startX, endY - startY);
  const steps = Math.max(1, Math.ceil(length));
  const radius = Math.max(0.5, strokeWidth / 2);

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = startX + (endX - startX) * t;
    const y = startY + (endY - startY) * t;
    drawFilledCircle(buffer, width, height, x, y, radius, color);
  }
}

function drawDashedPolygon(
  buffer: Buffer,
  width: number,
  height: number,
  loop: Point[],
  offsetX: number,
  offsetY: number,
  dashLength: number,
  dashGap: number,
  strokeWidth: number,
  color: [number, number, number, number],
) {
  if (loop.length < 2) {
    return;
  }

  const cycle = dashLength + dashGap;
  let phase = 0;

  for (let index = 0; index < loop.length; index += 1) {
    const current = loop[index];
    const next = loop[(index + 1) % loop.length];
    const startX = current.x + offsetX;
    const startY = current.y + offsetY;
    const endX = next.x + offsetX;
    const endY = next.y + offsetY;
    const segmentLength = Math.hypot(endX - startX, endY - startY);

    if (segmentLength <= 0) {
      continue;
    }

    let travelled = 0;
    while (travelled < segmentLength) {
      const patternOffset = (phase + travelled) % cycle;
      const remainingLength = segmentLength - travelled;

      if (patternOffset < dashLength) {
        const drawLength = Math.min(dashLength - patternOffset, remainingLength);
        const fromT = travelled / segmentLength;
        const toT = (travelled + drawLength) / segmentLength;

        drawStrokeSegment(
          buffer,
          width,
          height,
          startX + (endX - startX) * fromT,
          startY + (endY - startY) * fromT,
          startX + (endX - startX) * toT,
          startY + (endY - startY) * toT,
          strokeWidth,
          color,
        );

        travelled += drawLength;
      } else {
        travelled += Math.min(cycle - patternOffset, remainingLength);
      }
    }

    phase += segmentLength;
  }
}

function drawImageBuffer(
  destination: Buffer,
  destinationWidth: number,
  destinationHeight: number,
  source: Buffer,
  sourceWidth: number,
  sourceHeight: number,
  left: number,
  top: number,
) {
  for (let y = 0; y < sourceHeight; y += 1) {
    for (let x = 0; x < sourceWidth; x += 1) {
      const sourceOffset = (y * sourceWidth + x) * 4;
      blendPixel(destination, destinationWidth, destinationHeight, left + x, top + y, [
        source[sourceOffset],
        source[sourceOffset + 1],
        source[sourceOffset + 2],
        source[sourceOffset + 3],
      ]);
    }
  }
}

export async function buildSmoothCutoutBuffer(
  sourceBuffer: Buffer,
  size: number,
  options?: Partial<Omit<SmoothCutoutOptions, "size">>,
) {
  const sharp = (await import("sharp")).default;
  const config: SmoothCutoutOptions = { ...GENERATED_CUTOUT_OPTIONS, ...options, size };
  const padding = getSmoothCutoutPadding(config.offset, config.strokeWidth, config.dashGap);
  const contentSize = Math.max(64, size - padding * 2);
  const prepared = await sharp(sourceBuffer)
    .rotate()
    .resize(contentSize, contentSize, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = prepared;
  const detection = detectModeFromCornerAlpha(data, info.width, info.height, config);
  const mask = buildForegroundMask(data, info.width, info.height, detection.mode, detection.threshold);

  if (!mask.some(Boolean)) {
    throw new Error("当前图片未识别到可生成剪纸轮廓的主体区域。");
  }

  const dilatedMask = await dilateMaskViaBlur(mask, info.width, info.height, config.offset);
  let loops = extractContour(dilatedMask, info.width, info.height);

  if (loops.length === 0) {
    throw new Error("当前图片未生成有效的平滑剪纸轮廓。");
  }

  loops = loops
    .map((loop) => simplifyByDistance(loop, config.simplifyTolerance))
    .map((loop) => chaikinSmooth(loop, config.smoothIterations))
    .filter((loop) => loop.length >= 3);

  if (loops.length === 0) {
    throw new Error("当前图片未生成有效的平滑剪纸轮廓。");
  }

  const output = Buffer.alloc(size * size * 4, 255);
  for (let index = 0; index < size * size; index += 1) {
    output[index * 4 + 3] = 255;
  }

  drawImageBuffer(output, size, size, Buffer.from(data), info.width, info.height, padding, padding);
  loops.forEach((loop) => {
    drawDashedPolygon(
      output,
      size,
      size,
      loop,
      padding,
      padding,
      config.dashLength,
      config.dashGap,
      config.strokeWidth,
      [17, 17, 17, 255],
    );
  });

  return sharp(output, {
    raw: {
      width: size,
      height: size,
      channels: 4,
    },
  })
    .png()
    .toBuffer();
}
