const MASK_ALPHA_THRESHOLD = 25;
const MASK_WHITE_THRESHOLD = 240;
const MASK_BG_COLOR_TOLERANCE = 26;
const MASK_OUTLINE_OFFSET_PX = 18;
const MASK_OUTLINE_WIDTH_PX = 3;
const MASK_OUTLINE_BLUR_SIGMA = 3.2;
const MASK_OUTLINE_THRESHOLD = 168;
const MASK_DASH_ON_PX = 12;
const MASK_DASH_OFF_PX = 8;

function colorDistanceSq(
  data: Buffer | Uint8Array,
  offset: number,
  rgb: [number, number, number],
) {
  const dr = data[offset] - rgb[0];
  const dg = data[offset + 1] - rgb[1];
  const db = data[offset + 2] - rgb[2];
  return dr * dr + dg * dg + db * db;
}

function fillHoles(mask: Uint8Array, width: number, height: number) {
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  for (let x = 0; x < width; x += 1) {
    if (!mask[x]) {
      visited[x] = 1;
      queue.push(x);
    }
    const bottom = (height - 1) * width + x;
    if (!mask[bottom]) {
      visited[bottom] = 1;
      queue.push(bottom);
    }
  }

  for (let y = 1; y < height - 1; y += 1) {
    const left = y * width;
    if (!mask[left]) {
      visited[left] = 1;
      queue.push(left);
    }
    const right = y * width + width - 1;
    if (!mask[right]) {
      visited[right] = 1;
      queue.push(right);
    }
  }

  const dirs: [number, number][] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  let head = 0;

  while (head < queue.length) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx - x) / width;

    for (const [dx, dy] of dirs) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const next = ny * width + nx;
      if (!visited[next] && !mask[next]) {
        visited[next] = 1;
        queue.push(next);
      }
    }
  }

  for (let i = 0; i < width * height; i += 1) {
    mask[i] = visited[i] ? 0 : 1;
  }
}

function keepLargestComponent(mask: Uint8Array, width: number, height: number) {
  const visited = new Uint8Array(width * height);
  const largest = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let largestCount = 0;

  for (let start = 0; start < width * height; start += 1) {
    if (!mask[start] || visited[start]) {
      continue;
    }

    let head = 0;
    let tail = 0;
    const members: number[] = [];
    visited[start] = 1;
    queue[tail++] = start;

    while (head < tail) {
      const idx = queue[head++];
      members.push(idx);
      const x = idx % width;
      const y = (idx - x) / width;

      if (x > 0) {
        const left = idx - 1;
        if (mask[left] && !visited[left]) {
          visited[left] = 1;
          queue[tail++] = left;
        }
      }
      if (x + 1 < width) {
        const right = idx + 1;
        if (mask[right] && !visited[right]) {
          visited[right] = 1;
          queue[tail++] = right;
        }
      }
      if (y > 0) {
        const up = idx - width;
        if (mask[up] && !visited[up]) {
          visited[up] = 1;
          queue[tail++] = up;
        }
      }
      if (y + 1 < height) {
        const down = idx + width;
        if (mask[down] && !visited[down]) {
          visited[down] = 1;
          queue[tail++] = down;
        }
      }
    }

    if (members.length > largestCount) {
      largest.fill(0);
      for (const idx of members) {
        largest[idx] = 1;
      }
      largestCount = members.length;
    }
  }

  return largestCount > 0 ? largest : mask;
}

function dilate(mask: Uint8Array, width: number, height: number, radius: number) {
  if (radius <= 0) {
    return mask.slice();
  }

  const out = new Uint8Array(width * height);
  const radiusSquared = radius * radius;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x]) {
        out[y * width + x] = 1;
        continue;
      }

      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const y0 = Math.max(0, y - radius);
      const y1 = Math.min(height - 1, y + radius);
      let found = false;

      for (let yy = y0; yy <= y1 && !found; yy += 1) {
        for (let xx = x0; xx <= x1 && !found; xx += 1) {
          if ((xx - x) * (xx - x) + (yy - y) * (yy - y) > radiusSquared) {
            continue;
          }
          if (mask[yy * width + xx]) {
            found = true;
          }
        }
      }

      out[y * width + x] = found ? 1 : 0;
    }
  }

  return out;
}

function buildBinaryMask(data: Buffer | Uint8Array, width: number, height: number) {
  const total = width * height;
  const mask = new Uint8Array(total);

  let transparentCount = 0;
  for (let i = 0; i < total; i += 1) {
    if (data[i * 4 + 3] < 250) {
      transparentCount += 1;
    }
  }

  if (transparentCount > total * 0.01) {
    for (let i = 0; i < total; i += 1) {
      mask[i] = data[i * 4 + 3] > MASK_ALPHA_THRESHOLD ? 1 : 0;
    }
    return mask;
  }

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 80));

  for (let x = 0; x < width; x += step) {
    const top = x * 4;
    const bottom = ((height - 1) * width + x) * 4;
    sumR += data[top] + data[bottom];
    sumG += data[top + 1] + data[bottom + 1];
    sumB += data[top + 2] + data[bottom + 2];
    count += 2;
  }

  for (let y = step; y < height - step; y += step) {
    const left = y * width * 4;
    const right = (y * width + width - 1) * 4;
    sumR += data[left] + data[right];
    sumG += data[left + 1] + data[right + 1];
    sumB += data[left + 2] + data[right + 2];
    count += 2;
  }

  const borderColor: [number, number, number] = count
    ? [sumR / count, sumG / count, sumB / count]
    : [245, 245, 245];
  const toleranceSq = 3 * MASK_BG_COLOR_TOLERANCE * MASK_BG_COLOR_TOLERANCE;

  const background = new Uint8Array(total);
  const queue = new Uint32Array(total);
  let head = 0;
  let tail = 0;

  const pushBackground = (x: number, y: number) => {
    const idx = y * width + x;
    if (background[idx]) return;

    const offset = idx * 4;
    const nearBorderColor = colorDistanceSq(data, offset, borderColor) <= toleranceSq;
    const veryLight =
      data[offset] >= MASK_WHITE_THRESHOLD &&
      data[offset + 1] >= MASK_WHITE_THRESHOLD &&
      data[offset + 2] >= MASK_WHITE_THRESHOLD;

    if (!nearBorderColor && !veryLight) {
      return;
    }

    background[idx] = 1;
    queue[tail++] = idx;
  };

  for (let x = 0; x < width; x += 1) {
    pushBackground(x, 0);
    pushBackground(x, height - 1);
  }

  for (let y = 1; y < height - 1; y += 1) {
    pushBackground(0, y);
    pushBackground(width - 1, y);
  }

  while (head < tail) {
    const idx = queue[head++];
    const x = idx % width;
    const y = (idx - x) / width;

    if (x > 0) pushBackground(x - 1, y);
    if (x + 1 < width) pushBackground(x + 1, y);
    if (y > 0) pushBackground(x, y - 1);
    if (y + 1 < height) pushBackground(x, y + 1);
  }

  for (let i = 0; i < total; i += 1) {
    mask[i] = background[i] ? 0 : 1;
  }

  return mask;
}

async function buildSolidMask(sourceBuffer: Buffer, size: number) {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(sourceBuffer)
    .rotate()
    .resize(size, size, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const mask = buildBinaryMask(data, info.width, info.height);
  fillHoles(mask, info.width, info.height);
  const solidMask = keepLargestComponent(mask, info.width, info.height);

  return {
    mask: solidMask,
    width: info.width,
    height: info.height,
  };
}

async function smoothMask(mask: Uint8Array, width: number, height: number) {
  const sharp = (await import("sharp")).default;
  const gray = Buffer.alloc(width * height);

  for (let i = 0; i < mask.length; i += 1) {
    gray[i] = mask[i] ? 255 : 0;
  }

  const blurred = await sharp(gray, {
    raw: { width, height, channels: 1 },
  })
    .blur(MASK_OUTLINE_BLUR_SIGMA)
    .raw()
    .toBuffer();

  const nextMask = new Uint8Array(width * height);
  for (let i = 0; i < nextMask.length; i += 1) {
    nextMask[i] = blurred[i] >= MASK_OUTLINE_THRESHOLD ? 1 : 0;
  }

  fillHoles(nextMask, width, height);
  return keepLargestComponent(nextMask, width, height);
}

function shouldKeepDashedPixel(x: number, y: number) {
  const cycle = MASK_DASH_ON_PX + MASK_DASH_OFF_PX;
  return ((x + y) % cycle + cycle) % cycle < MASK_DASH_ON_PX;
}

export async function buildOutlinedMaskPreviewPngBuffer(sourceBuffer: Buffer, size: number) {
  const sharp = (await import("sharp")).default;
  const { mask, width, height } = await buildSolidMask(sourceBuffer, size);
  const smoothedBaseMask = await smoothMask(mask, width, height);
  const outlineOuterMask = dilate(smoothedBaseMask, width, height, MASK_OUTLINE_OFFSET_PX);
  const outlineInnerSeedMask = dilate(
    smoothedBaseMask,
    width,
    height,
    Math.max(0, MASK_OUTLINE_OFFSET_PX - MASK_OUTLINE_WIDTH_PX),
  );
  const outlineRingMask = new Uint8Array(width * height);
  const output = Buffer.alloc(width * height * 4, 255);

  for (let i = 0; i < outlineRingMask.length; i += 1) {
    outlineRingMask[i] = outlineOuterMask[i] === 1 && outlineInnerSeedMask[i] === 0 ? 1 : 0;
  }

  const largestOutlineRingMask = keepLargestComponent(outlineRingMask, width, height);

  for (let i = 0; i < mask.length; i += 1) {
    const offset = i * 4;
    const x = i % width;
    const y = (i - x) / width;
    const isOutline = largestOutlineRingMask[i] === 1 && shouldKeepDashedPixel(x, y);

    if (isOutline) {
      output[offset] = 170;
      output[offset + 1] = 175;
      output[offset + 2] = 185;
    }

    if (mask[i]) {
      output[offset] = 0;
      output[offset + 1] = 0;
      output[offset + 2] = 0;
    }

    output[offset + 3] = 255;
  }

  return sharp(output, {
    raw: { width, height, channels: 4 },
  })
    .png()
    .toBuffer();
}

export async function buildCutOutlinePreviewPngBuffer(sourceBuffer: Buffer, size: number) {
  const sharp = (await import("sharp")).default;
  const prepared = await sharp(sourceBuffer)
    .rotate()
    .resize(size, size, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data, info } = prepared;
  const mask = buildBinaryMask(data, info.width, info.height);
  fillHoles(mask, info.width, info.height);
  const solidMask = keepLargestComponent(mask, info.width, info.height);
  const smoothedBaseMask = await smoothMask(solidMask, info.width, info.height);
  const outlineOuterMask = dilate(smoothedBaseMask, info.width, info.height, MASK_OUTLINE_OFFSET_PX);
  const outlineInnerSeedMask = dilate(
    smoothedBaseMask,
    info.width,
    info.height,
    Math.max(0, MASK_OUTLINE_OFFSET_PX - MASK_OUTLINE_WIDTH_PX),
  );
  const outlineRingMask = new Uint8Array(info.width * info.height);
  const output = Buffer.from(data);

  for (let i = 0; i < outlineRingMask.length; i += 1) {
    outlineRingMask[i] = outlineOuterMask[i] === 1 && outlineInnerSeedMask[i] === 0 ? 1 : 0;
  }

  const largestOutlineRingMask = keepLargestComponent(outlineRingMask, info.width, info.height);

  for (let i = 0; i < solidMask.length; i += 1) {
    const offset = i * 4;
    const x = i % info.width;
    const y = (i - x) / info.width;
    const isOutline = largestOutlineRingMask[i] === 1 && shouldKeepDashedPixel(x, y);

    if (isOutline) {
      output[offset] = 170;
      output[offset + 1] = 175;
      output[offset + 2] = 185;
      output[offset + 3] = 255;
      continue;
    }

    if (!solidMask[i]) {
      output[offset] = 255;
      output[offset + 1] = 255;
      output[offset + 2] = 255;
      output[offset + 3] = 255;
    } else {
      output[offset + 3] = 255;
    }
  }

  return sharp(output, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toBuffer();
}
