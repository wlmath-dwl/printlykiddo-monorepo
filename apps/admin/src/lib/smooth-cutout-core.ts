export type Point = {
  x: number;
  y: number;
};

export type DetectionMode = "alpha" | "luminance";

export type SmoothCutoutThresholds = {
  alphaThreshold: number;
  luminanceThreshold: number;
};

export const SMOOTH_CUTOUT_TEST_DEFAULTS = {
  offset: 28,
  simplifyTolerance: 5,
  smoothIterations: 3,
  dashLength: 16,
  dashGap: 26,
  strokeWidth: 5,
  alphaThreshold: 10,
  luminanceThreshold: 240,
} as const;

// 三级功能图生成复用测试页确认后的剪纸参数，避免预览和正式生成效果不一致。
export const SMOOTH_CUTOUT_GENERATED_DEFAULTS = SMOOTH_CUTOUT_TEST_DEFAULTS;

export function buildForegroundMask(
  data: ArrayLike<number>,
  width: number,
  height: number,
  mode: DetectionMode,
  threshold: number,
) {
  const mask = new Uint8Array(width * height);

  for (let index = 0; index < width * height; index += 1) {
    if (mode === "alpha") {
      mask[index] = data[index * 4 + 3] > threshold ? 1 : 0;
      continue;
    }

    const alpha = data[index * 4 + 3];
    if (alpha < 10) {
      mask[index] = 0;
      continue;
    }

    const r = data[index * 4];
    const g = data[index * 4 + 1];
    const b = data[index * 4 + 2];
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    mask[index] = luminance < threshold ? 1 : 0;
  }

  return mask;
}

export function extractContour(mask: Uint8Array, width: number, height: number): Point[][] {
  type Edge = { start: Point; end: Point };
  const edges: Edge[] = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const filled = mask[y * width + x] === 1;
      if (!filled) {
        continue;
      }

      if (y === 0 || mask[(y - 1) * width + x] === 0) {
        edges.push({ start: { x, y }, end: { x: x + 1, y } });
      }
      if (y === height - 1 || mask[(y + 1) * width + x] === 0) {
        edges.push({ start: { x: x + 1, y: y + 1 }, end: { x, y: y + 1 } });
      }
      if (x === 0 || mask[y * width + x - 1] === 0) {
        edges.push({ start: { x, y: y + 1 }, end: { x, y } });
      }
      if (x === width - 1 || mask[y * width + x + 1] === 0) {
        edges.push({ start: { x: x + 1, y }, end: { x: x + 1, y: y + 1 } });
      }
    }
  }

  const edgeMap = new Map<string, Point[]>();
  const pointKey = (point: Point) => `${point.x},${point.y}`;

  for (const edge of edges) {
    const key = pointKey(edge.start);
    const nextEdges = edgeMap.get(key) ?? [];
    nextEdges.push(edge.end);
    edgeMap.set(key, nextEdges);
  }

  const loops: Point[][] = [];
  while (edgeMap.size > 0) {
    const startKey = edgeMap.keys().next().value as string;
    const [startX, startY] = startKey.split(",").map(Number);
    const start: Point = { x: startX, y: startY };
    const loop: Point[] = [start];
    let current = start;

    while (true) {
      const key = pointKey(current);
      const nextEdges = edgeMap.get(key);
      if (!nextEdges || nextEdges.length === 0) {
        edgeMap.delete(key);
        break;
      }

      const next = nextEdges.pop();
      if (nextEdges.length === 0) {
        edgeMap.delete(key);
      }

      if (!next) {
        break;
      }

      if (pointKey(next) === startKey) {
        break;
      }

      loop.push(next);
      current = next;
    }

    let area = 0;
    for (let index = 0; index < loop.length; index += 1) {
      const currentPoint = loop[index];
      const nextPoint = loop[(index + 1) % loop.length];
      area += currentPoint.x * nextPoint.y - nextPoint.x * currentPoint.y;
    }

    if (area > 0 && loop.length >= 3) {
      loops.push(loop);
    }
  }

  if (loops.length === 0) {
    return [];
  }

  loops.sort((left, right) => {
    const leftArea = Math.abs(
      left.reduce((sum, point, index) => {
        const next = left[(index + 1) % left.length];
        return sum + point.x * next.y - next.x * point.y;
      }, 0),
    );
    const rightArea = Math.abs(
      right.reduce((sum, point, index) => {
        const next = right[(index + 1) % right.length];
        return sum + point.x * next.y - next.x * point.y;
      }, 0),
    );

    return rightArea - leftArea;
  });

  return [loops[0]];
}

export function simplifyByDistance(loop: Point[], tolerance: number) {
  if (loop.length <= 4) {
    return loop;
  }

  const toleranceSquared = tolerance * tolerance;
  const simplified: Point[] = [loop[0]];

  for (let index = 1; index < loop.length; index += 1) {
    const last = simplified[simplified.length - 1];
    const current = loop[index];
    const dx = current.x - last.x;
    const dy = current.y - last.y;

    if (dx * dx + dy * dy >= toleranceSquared) {
      simplified.push(current);
    }
  }

  return simplified.length >= 3 ? simplified : loop;
}

export function chaikinSmooth(loop: Point[], iterations: number) {
  let points = loop;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const next: Point[] = [];

    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const following = points[(index + 1) % points.length];
      next.push({
        x: 0.75 * current.x + 0.25 * following.x,
        y: 0.75 * current.y + 0.25 * following.y,
      });
      next.push({
        x: 0.25 * current.x + 0.75 * following.x,
        y: 0.25 * current.y + 0.75 * following.y,
      });
    }

    points = next;
  }

  return points;
}

export function detectModeFromCornerAlpha(
  data: ArrayLike<number>,
  width: number,
  height: number,
  thresholds: SmoothCutoutThresholds,
) {
  const corners = [
    0,
    (width - 1) * 4,
    (height - 1) * width * 4,
    ((height - 1) * width + width - 1) * 4,
  ];
  const hasTransparentCorner = corners.some((index) => data[index + 3] < 255);

  return hasTransparentCorner
    ? ({ mode: "alpha", threshold: thresholds.alphaThreshold } as const)
    : ({ mode: "luminance", threshold: thresholds.luminanceThreshold } as const);
}

export function getSmoothCutoutPadding(offset: number, strokeWidth: number, dashGap: number) {
  return offset + Math.ceil(strokeWidth) + dashGap + 4;
}
