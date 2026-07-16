// Shaped ("irregular") maze generator built on the standard *masked maze*
// approach (see Jamis Buck, "Mazes for Programmers", masking chapter):
//
//   1. Rasterise the uploaded silhouette into a binary mask.
//   2. Overlay a grid and mark the cells that fall inside the mask ("in" cells).
//   3. Carve a perfect maze (spanning tree) over the in-cells with a recursive
//      backtracker, treating out-of-mask cells as solid walls.
//   4. Render the maze so that a wall is drawn on every cell edge that borders
//      an out-of-mask cell (this *is* the silhouette outline) or an un-carved
//      neighbour (interior walls). There is a single representation of the
//      shape, so the outline is always closed by construction.
//   5. Entrance/exit are two boundary cells chosen as the endpoints of the tree
//      diameter; a "gate" is simply the one boundary wall segment we skip.
//
// Because the outline and the maze walls are the same geometry, the historical
// failure modes (misplaced exits, edge burrs, unsealed perimeter "cheat"
// corridors) cannot occur.
//
// The visible silhouette is the *true* contour of the uploaded image (marching
// squares on the pixel mask), not a curve fitted to the coarse grid. To keep
// the maze sealed against that contour, interior walls that touch the grid
// boundary are extended outward to the contour, closing the thin band between
// the grid edge and the outline into per-cell pockets.

import { contours } from "d3-contour";

export type MazeForeground = "black" | "white";
export type IrregularMazeDifficulty = "easy" | "hard";
export type InternalFeatureType = "original" | "eye" | "mouth" | "spot" | "blank";

export type DetectedInternalRegion = {
  id: string;
  area: number;
  centerX: number;
  centerY: number;
  width: number;
  height: number;
};

export type IrregularMazeOutput = {
  mazeUrl: string;
  answerUrl: string;
  cells: number;
  solutionSteps: number;
  seed: number;
  gridSize: number;
  difficulty: IrregularMazeDifficulty;
};

type Side = "top" | "right" | "bottom" | "left";

type MazeCandidate = {
  active: Uint8Array;
  gridSize: number;
  cellCount: number;
  passages: Set<string>;
  adjacency: Array<Set<number>>;
  entry: number;
  exit: number;
  entrySide: Side;
  exitSide: Side;
  path: number[];
  score: number;
};

const MASK_SIZE = 600;
const OUTPUT_SIZE = 1600;
const MASK_PADDING = 22;
const DRAW_MARGIN = 64;

const SIDES: Side[] = ["top", "right", "bottom", "left"];
const SIDE_DELTA: Record<Side, [number, number]> = {
  top: [0, -1],
  right: [1, 0],
  bottom: [0, 1],
  left: [-1, 0],
};

function mulberry32(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function rangeScore(value: number, minimum: number, maximum: number) {
  if (value >= minimum && value <= maximum) return 1;
  const span = Math.max(maximum - minimum, 0.001);
  return Math.max(0, 1 - (value < minimum ? minimum - value : value - maximum) / span);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法读取图片"));
    };
    image.src = url;
  });
}

function createCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  return canvas;
}

// ---------------------------------------------------------------------------
// Mask construction (pixel space, MASK_SIZE x MASK_SIZE)
// ---------------------------------------------------------------------------

function largestComponent(mask: Uint8Array, width: number, height: number) {
  const visited = new Uint8Array(mask.length);
  let largest: number[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    const component: number[] = [];
    const queue = [start];
    visited[start] = 1;
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head];
      component.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      neighbors.forEach((neighbor) => {
        if (neighbor >= 0 && mask[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      });
    }
    if (component.length > largest.length) largest = component;
  }
  const output = new Uint8Array(mask.length);
  largest.forEach((index) => { output[index] = 1; });
  return output;
}

function fillSmallHoles(mask: Uint8Array, width: number, height: number) {
  const outside = new Uint8Array(mask.length);
  const queue: number[] = [];
  const add = (index: number) => {
    if (!mask[index] && !outside[index]) {
      outside[index] = 1;
      queue.push(index);
    }
  };
  for (let x = 0; x < width; x += 1) {
    add(x);
    add((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    add(y * width);
    add(y * width + width - 1);
  }
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) add(index - 1);
    if (x + 1 < width) add(index + 1);
    if (y > 0) add(index - width);
    if (y + 1 < height) add(index + width);
  }
  const output = new Uint8Array(mask);
  const visited = new Uint8Array(mask.length);
  const minimumProtectedArea = 140;
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] || outside[start] || visited[start]) continue;
    const component: number[] = [];
    const holes = [start];
    visited[start] = 1;
    for (let head = 0; head < holes.length; head += 1) {
      const index = holes[head];
      component.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      neighbors.forEach((neighbor) => {
        if (neighbor >= 0 && !mask[neighbor] && !outside[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          holes.push(neighbor);
        }
      });
    }
    if (component.length < minimumProtectedArea) {
      component.forEach((index) => { output[index] = 1; });
    }
  }
  return output;
}

function fillAllHoles(mask: Uint8Array, width: number, height: number) {
  const outside = new Uint8Array(mask.length);
  const queue: number[] = [];
  const add = (index: number) => {
    if (!mask[index] && !outside[index]) {
      outside[index] = 1;
      queue.push(index);
    }
  };
  for (let x = 0; x < width; x += 1) {
    add(x);
    add((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    add(y * width);
    add(y * width + width - 1);
  }
  for (let head = 0; head < queue.length; head += 1) {
    const index = queue[head];
    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) add(index - 1);
    if (x + 1 < width) add(index + 1);
    if (y > 0) add(index - width);
    if (y + 1 < height) add(index + width);
  }
  const output = new Uint8Array(mask.length);
  for (let index = 0; index < output.length; index += 1) output[index] = mask[index] || !outside[index] ? 1 : 0;
  return output;
}

function findInternalRegions(mask: Uint8Array, width: number, height: number) {
  const visited = new Uint8Array(mask.length);
  const regions: Omit<DetectedInternalRegion, "id">[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] || visited[start]) continue;
    const queue = [start];
    visited[start] = 1;
    let touchesBorder = false;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let sumX = 0;
    let sumY = 0;
    for (let head = 0; head < queue.length; head += 1) {
      const index = queue[head];
      const x = index % width;
      const y = Math.floor(index / width);
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      sumX += x;
      sumY += y;
      const neighbors = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      neighbors.forEach((neighbor) => {
        if (neighbor >= 0 && !mask[neighbor] && !visited[neighbor]) {
          visited[neighbor] = 1;
          queue.push(neighbor);
        }
      });
    }
    if (!touchesBorder && queue.length >= 140) {
      regions.push({
        area: queue.length,
        centerX: sumX / queue.length,
        centerY: sumY / queue.length,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      });
    }
  }
  return regions
    .sort((a, b) => a.centerY - b.centerY || a.centerX - b.centerX)
    .map((region, index) => ({ ...region, id: `region-${index + 1}` }));
}

function erodeMask(mask: Uint8Array, width: number, height: number, radius: number) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!mask[index]) continue;
      let keep = 1;
      for (let dy = -radius; dy <= radius && keep; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height || !mask[ny * width + nx]) {
            keep = 0;
            break;
          }
        }
      }
      output[index] = keep;
    }
  }
  return output;
}

function dilateMask(mask: Uint8Array, width: number, height: number, radius: number) {
  const output = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let hit = 0;
      for (let dy = -radius; dy <= radius && !hit; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < width && ny < height && mask[ny * width + nx]) {
            hit = 1;
            break;
          }
        }
      }
      output[y * width + x] = hit;
    }
  }
  return output;
}

// Morphological opening removes thin spikes that would otherwise show up as a
// ragged silhouette, while preserving the overall shape.
function smoothMaskBoundary(mask: Uint8Array, width: number, height: number, radius = 2) {
  return dilateMask(erodeMask(mask, width, height, radius), width, height, radius);
}

function rasterizeSilhouette(image: HTMLImageElement, foreground: MazeForeground) {
  const canvas = document.createElement("canvas");
  canvas.width = MASK_SIZE;
  canvas.height = MASK_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("浏览器不支持 Canvas");
  context.fillStyle = foreground === "black" ? "#fff" : "#000";
  context.fillRect(0, 0, MASK_SIZE, MASK_SIZE);
  const scale = Math.min(
    (MASK_SIZE - MASK_PADDING * 2) / image.width,
    (MASK_SIZE - MASK_PADDING * 2) / image.height,
  );
  const width = image.width * scale;
  const height = image.height * scale;
  context.drawImage(image, (MASK_SIZE - width) / 2, (MASK_SIZE - height) / 2, width, height);
  const pixels = context.getImageData(0, 0, MASK_SIZE, MASK_SIZE).data;
  const raw = new Uint8Array(MASK_SIZE * MASK_SIZE);
  for (let index = 0; index < raw.length; index += 1) {
    const offset = index * 4;
    const luminance = pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722;
    raw[index] = Number(foreground === "black" ? luminance < 150 : luminance >= 150);
  }
  return raw;
}

function buildCleanMask(image: HTMLImageElement, foreground: MazeForeground) {
  const raw = rasterizeSilhouette(image, foreground);
  const opened = smoothMaskBoundary(largestComponent(raw, MASK_SIZE, MASK_SIZE), MASK_SIZE, MASK_SIZE);
  const cleaned = fillSmallHoles(largestComponent(opened, MASK_SIZE, MASK_SIZE), MASK_SIZE, MASK_SIZE);
  if (cleaned.reduce((sum, value) => sum + value, 0) < MASK_SIZE * MASK_SIZE * 0.025) {
    throw new Error("有效剪影面积太小，请上传轮廓更饱满的黑白图");
  }
  return cleaned;
}

function extractOriginalDecorations(image: HTMLImageElement, foreground: MazeForeground) {
  const raw = rasterizeSilhouette(image, foreground);
  const main = largestComponent(raw, MASK_SIZE, MASK_SIZE);
  const envelope = fillAllHoles(main, MASK_SIZE, MASK_SIZE);
  const decorations = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    decorations[index] = raw[index] && !main[index] && envelope[index] ? 1 : 0;
  }
  return decorations;
}

// ---------------------------------------------------------------------------
// Grid masking
// ---------------------------------------------------------------------------

function sampleGrid(mask: Uint8Array, gridSize: number) {
  const activeMask = new Uint8Array(gridSize * gridSize);
  const pixelPerCell = MASK_SIZE / gridSize;
  for (let row = 0; row < gridSize; row += 1) {
    for (let col = 0; col < gridSize; col += 1) {
      const x0 = Math.floor(col * pixelPerCell);
      const x1 = Math.ceil((col + 1) * pixelPerCell);
      const y0 = Math.floor(row * pixelPerCell);
      const y1 = Math.ceil((row + 1) * pixelPerCell);
      let inside = 0;
      let total = 0;
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          inside += mask[y * MASK_SIZE + x];
          total += 1;
        }
      }
      if (total > 0 && inside / total >= 0.5) activeMask[row * gridSize + col] = 1;
    }
  }
  return largestComponent(activeMask, gridSize, gridSize);
}

// ---------------------------------------------------------------------------
// Maze topology (grid space)
// ---------------------------------------------------------------------------

function passageKey(a: number, b: number) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}

function neighborId(id: number, side: Side, gridSize: number) {
  const row = Math.floor(id / gridSize);
  const col = id % gridSize;
  const [dx, dy] = SIDE_DELTA[side];
  const nc = col + dx;
  const nr = row + dy;
  if (nc < 0 || nr < 0 || nc >= gridSize || nr >= gridSize) return -1;
  return nr * gridSize + nc;
}

function activeNeighbors(id: number, active: Uint8Array, gridSize: number) {
  const result: number[] = [];
  for (const side of SIDES) {
    const nb = neighborId(id, side, gridSize);
    if (nb >= 0 && active[nb]) result.push(nb);
  }
  return result;
}

// Growing-tree carver. Produces a perfect maze (spanning tree), but the choice
// rule tunes its texture: picking the newest frontier cell behaves like a
// recursive backtracker (long winding corridors, few junctions), while picking
// a random frontier cell behaves like Prim's (many short branches, dense
// junctions). `branchBias` is the probability of the random pick, so higher
// bias = more forks along the way = harder to read as a single path.
function carveMaze(active: Uint8Array, gridSize: number, random: () => number, branchBias: number) {
  const adjacency = Array.from({ length: active.length }, () => new Set<number>());
  const passages = new Set<string>();
  const visited = new Uint8Array(active.length);

  let start = -1;
  for (let id = 0; id < active.length; id += 1) {
    if (active[id]) { start = id; break; }
  }
  if (start < 0) return null;

  const frontier = [start];
  visited[start] = 1;
  while (frontier.length > 0) {
    const index = random() < branchBias
      ? Math.floor(random() * frontier.length)
      : frontier.length - 1;
    const current = frontier[index];
    const options = activeNeighbors(current, active, gridSize).filter((nb) => !visited[nb]);
    if (options.length === 0) {
      frontier.splice(index, 1);
      continue;
    }
    const next = options[Math.floor(random() * options.length)];
    adjacency[current].add(next);
    adjacency[next].add(current);
    passages.add(passageKey(current, next));
    visited[next] = 1;
    frontier.push(next);
  }
  return { adjacency, passages };
}

function bfsTree(start: number, adjacency: Array<Set<number>>) {
  const distance = new Int32Array(adjacency.length).fill(-1);
  const parent = new Int32Array(adjacency.length).fill(-1);
  const queue = [start];
  distance[start] = 0;
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head];
    adjacency[node].forEach((neighbor) => {
      if (distance[neighbor] === -1) {
        distance[neighbor] = distance[node] + 1;
        parent[neighbor] = node;
        queue.push(neighbor);
      }
    });
  }
  return { distance, parent };
}

function buildPath(start: number, end: number, parent: Int32Array) {
  const path = [end];
  while (path[path.length - 1] !== start) {
    const previous = parent[path[path.length - 1]];
    if (previous < 0) return null;
    path.push(previous);
  }
  return path.reverse();
}

// Flood the exterior through out-of-mask cells from the grid border. Cells not
// reached are internal holes (kept features), which must not host a gate.
function computeExterior(active: Uint8Array, gridSize: number) {
  const exterior = new Uint8Array(active.length);
  const queue: number[] = [];
  const add = (id: number) => {
    if (id >= 0 && !active[id] && !exterior[id]) {
      exterior[id] = 1;
      queue.push(id);
    }
  };
  for (let col = 0; col < gridSize; col += 1) {
    add(col);
    add((gridSize - 1) * gridSize + col);
  }
  for (let row = 0; row < gridSize; row += 1) {
    add(row * gridSize);
    add(row * gridSize + gridSize - 1);
  }
  for (let head = 0; head < queue.length; head += 1) {
    const id = queue[head];
    for (const side of SIDES) add(neighborId(id, side, gridSize));
  }
  return exterior;
}

function outerExposedSides(id: number, active: Uint8Array, exterior: Uint8Array, gridSize: number): Side[] {
  const result: Side[] = [];
  for (const side of SIDES) {
    const nb = neighborId(id, side, gridSize);
    if (nb < 0 || exterior[nb]) result.push(side);
  }
  return result;
}

function centroidOf(active: Uint8Array, gridSize: number) {
  let sumCol = 0;
  let sumRow = 0;
  let count = 0;
  for (let id = 0; id < active.length; id += 1) {
    if (!active[id]) continue;
    sumCol += id % gridSize;
    sumRow += Math.floor(id / gridSize);
    count += 1;
  }
  return { col: sumCol / Math.max(1, count), row: sumRow / Math.max(1, count) };
}

// Choose the exposed side that points most directly away from the shape centre,
// so the opening reads as a natural entrance rather than tucked into a notch.
function chooseGateSide(
  id: number,
  active: Uint8Array,
  exterior: Uint8Array,
  gridSize: number,
  centroid: { col: number; row: number },
): Side | null {
  const sides = outerExposedSides(id, active, exterior, gridSize);
  if (sides.length === 0) return null;
  const col = id % gridSize;
  const row = Math.floor(id / gridSize);
  let outwardX = col + 0.5 - centroid.col;
  let outwardY = row + 0.5 - centroid.row;
  const length = Math.hypot(outwardX, outwardY) || 1;
  outwardX /= length;
  outwardY /= length;
  let best: Side = sides[0];
  let bestScore = -Infinity;
  for (const side of sides) {
    const [dx, dy] = SIDE_DELTA[side];
    const score = dx * outwardX + dy * outwardY;
    if (score > bestScore) {
      bestScore = score;
      best = side;
    }
  }
  return best;
}

// Count active cells in a local window. Thin appendages (a pumpkin stem, a
// tail, an antenna) have a low count, so we can keep gates off their tips.
function localActiveCount(id: number, active: Uint8Array, gridSize: number, radius: number) {
  const col = id % gridSize;
  const row = Math.floor(id / gridSize);
  let count = 0;
  for (let r = row - radius; r <= row + radius; r += 1) {
    for (let c = col - radius; c <= col + radius; c += 1) {
      if (c < 0 || r < 0 || c >= gridSize || r >= gridSize) continue;
      if (active[r * gridSize + c]) count += 1;
    }
  }
  return count;
}

function geoDistance(a: number, b: number, gridSize: number) {
  return Math.hypot((a % gridSize) - (b % gridSize), Math.floor(a / gridSize) - Math.floor(b / gridSize));
}

// Pick the boundary cell that is best both far along the tree AND far in space
// from `source`, so entrance and exit end up on genuinely opposite parts of the
// silhouette rather than clustered wherever the graph diameter happens to land.
function pickFarEndpoint(
  source: number,
  adjacency: Array<Set<number>>,
  eligible: number[],
  gridSize: number,
) {
  const { distance } = bfsTree(source, adjacency);
  let maxTree = 1;
  for (const id of eligible) if (distance[id] > maxTree) maxTree = distance[id];
  const diagonal = Math.hypot(gridSize, gridSize);

  let best = source;
  let bestScore = -1;
  for (const id of eligible) {
    if (distance[id] <= 0) continue;
    const treeScore = distance[id] / maxTree;
    const geoScore = geoDistance(source, id, gridSize) / diagonal;
    const score = treeScore * 0.45 + geoScore * 0.55;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Candidate assembly & scoring
// ---------------------------------------------------------------------------

function scoreMaze(
  active: Uint8Array,
  adjacency: Array<Set<number>>,
  path: number[],
  cellCount: number,
  difficulty: IrregularMazeDifficulty,
) {
  const solutionRatio = path.length / Math.max(1, cellCount);
  const decisionPoints = path.reduce((sum, id) => sum + (adjacency[id].size >= 3 ? 1 : 0), 0);
  let deadEnds = 0;
  for (let id = 0; id < active.length; id += 1) {
    if (active[id] && adjacency[id].size === 1) deadEnds += 1;
  }
  const deadEndRatio = deadEnds / Math.max(1, cellCount);

  if (difficulty === "easy") {
    return (
      rangeScore(cellCount, 60, 200) * 0.4 +
      rangeScore(solutionRatio, 0.12, 0.32) * 0.3 +
      rangeScore(decisionPoints, 3, 14) * 0.2 +
      rangeScore(deadEndRatio, 0.05, 0.2) * 0.1
    );
  }
  return (
    rangeScore(cellCount, 280, 900) * 0.3 +
    rangeScore(solutionRatio, 0.16, 0.44) * 0.3 +
    rangeScore(decisionPoints, Math.max(6, path.length * 0.14), Math.max(12, path.length * 0.4)) * 0.25 +
    rangeScore(deadEndRatio, 0.12, 0.28) * 0.15
  );
}

function buildCandidate(
  mask: Uint8Array,
  gridSize: number,
  seed: number,
  difficulty: IrregularMazeDifficulty,
): MazeCandidate | null {
  const active = sampleGrid(mask, gridSize);
  let cellCount = 0;
  for (let id = 0; id < active.length; id += 1) cellCount += active[id];
  if (cellCount < 40) return null;

  const random = mulberry32(seed);
  // Easy stays corridor-like (few choices, good for young children); hard leans
  // toward Prim-like branching so the solution is not an obvious single path.
  const branchBias = difficulty === "easy" ? 0.12 : 0.6;
  const carved = carveMaze(active, gridSize, random, branchBias);
  if (!carved) return null;
  const { adjacency, passages } = carved;

  const exterior = computeExterior(active, gridSize);
  const boundaryCells: number[] = [];
  for (let id = 0; id < active.length; id += 1) {
    if (active[id] && outerExposedSides(id, active, exterior, gridSize).length > 0) {
      boundaryCells.push(id);
    }
  }
  if (boundaryCells.length < 2) return null;

  // Keep gates off thin appendage tips (stem, tail…) so both openings land on
  // the main body; fall back to all boundary cells for very slender shapes.
  let eligible = boundaryCells.filter((id) => localActiveCount(id, active, gridSize, 2) >= 9);
  if (eligible.length < 2) eligible = boundaryCells;

  const centroid = centroidOf(active, gridSize);
  // Anchor at the eligible cell geometrically farthest from the centre, then
  // pick endpoints that are far both along the tree and in space.
  let anchor = eligible[0];
  let bestAnchor = -1;
  for (const id of eligible) {
    const distance = Math.hypot(id % gridSize + 0.5 - centroid.col, Math.floor(id / gridSize) + 0.5 - centroid.row);
    if (distance > bestAnchor) {
      bestAnchor = distance;
      anchor = id;
    }
  }
  const entry = pickFarEndpoint(anchor, adjacency, eligible, gridSize);
  const exit = pickFarEndpoint(entry, adjacency, eligible, gridSize);
  if (entry === exit) return null;

  const { parent } = bfsTree(entry, adjacency);
  const path = buildPath(entry, exit, parent);
  if (!path || path.length < 2) return null;

  // Reject solutions that read as a single corridor: require enough real forks
  // (degree ≥ 3 cells) along the answer path for the harder tier.
  if (difficulty === "hard") {
    const decisionPoints = path.reduce((sum, id) => sum + (adjacency[id].size >= 3 ? 1 : 0), 0);
    if (decisionPoints < Math.max(4, Math.floor(path.length * 0.1))) return null;
  }

  const entrySide = chooseGateSide(entry, active, exterior, gridSize, centroid);
  const exitSide = chooseGateSide(exit, active, exterior, gridSize, centroid);
  if (!entrySide || !exitSide) return null;

  return {
    active,
    gridSize,
    cellCount,
    passages,
    adjacency,
    entry,
    exit,
    entrySide,
    exitSide,
    path,
    score: scoreMaze(active, adjacency, path, cellCount, difficulty),
  };
}

// ---------------------------------------------------------------------------
// Rendering (output space)
// ---------------------------------------------------------------------------

function gridToOutput(col: number, row: number, cellSize: number): [number, number] {
  return [DRAW_MARGIN + col * cellSize, DRAW_MARGIN + row * cellSize];
}

function sideSegment(col: number, row: number, side: Side): [[number, number], [number, number]] {
  if (side === "top") return [[col, row], [col + 1, row]];
  if (side === "bottom") return [[col, row + 1], [col + 1, row + 1]];
  if (side === "left") return [[col, row], [col, row + 1]];
  return [[col + 1, row], [col + 1, row + 1]];
}

function gateEdgeMidpoint(id: number, side: Side, gridSize: number, cellSize: number): [number, number] {
  const col = id % gridSize;
  const row = Math.floor(id / gridSize);
  const [[ax, ay], [bx, by]] = sideSegment(col, row, side);
  return gridToOutput((ax + bx) / 2, (ay + by) / 2, cellSize);
}

function cellCenterOutput(id: number, gridSize: number, cellSize: number): [number, number] {
  const col = id % gridSize;
  const row = Math.floor(id / gridSize);
  return gridToOutput(col + 0.5, row + 0.5, cellSize);
}

function isBoundaryVertex(col: number, row: number, active: Uint8Array, gridSize: number) {
  // A grid vertex is on the region boundary unless all four cells touching it
  // are in-cells.
  const cells: Array<[number, number]> = [
    [col - 1, row - 1],
    [col, row - 1],
    [col - 1, row],
    [col, row],
  ];
  for (const [c, r] of cells) {
    if (c < 0 || r < 0 || c >= gridSize || r >= gridSize) return true;
    if (!active[r * gridSize + c]) return true;
  }
  return false;
}

// Interior walls (edges between two in-cells that were not carved). Any wall
// endpoint sitting on the grid boundary is extended outward along the wall's
// own line so it reaches the true contour, sealing the band between the coarse
// grid and the detailed outline into isolated pockets (no perimeter shortcut).
function drawInteriorWalls(
  canvas: HTMLCanvasElement,
  candidate: MazeCandidate,
  cellSize: number,
) {
  const { active, gridSize, passages } = candidate;
  const context = canvas.getContext("2d")!;
  context.strokeStyle = "#111";
  context.lineWidth = Math.max(2.6, cellSize * 0.15);
  context.lineCap = "round";
  context.lineJoin = "round";

  const extend = 1.7; // grid units; trimmed to the contour by the mask clip
  const drawn = new Set<string>();
  for (let id = 0; id < active.length; id += 1) {
    if (!active[id]) continue;
    const col = id % gridSize;
    const row = Math.floor(id / gridSize);
    for (const side of SIDES) {
      const nb = neighborId(id, side, gridSize);
      if (nb < 0 || !active[nb]) continue; // outer boundary handled by the contour
      if (passages.has(passageKey(id, nb))) continue;

      const [[ax, ay], [bx, by]] = sideSegment(col, row, side);
      const key = ax <= bx && ay <= by ? `${ax},${ay},${bx},${by}` : `${bx},${by},${ax},${ay}`;
      if (drawn.has(key)) continue;
      drawn.add(key);

      const dx = Math.sign(bx - ax);
      const dy = Math.sign(by - ay);
      let startCol = ax;
      let startRow = ay;
      let endCol = bx;
      let endRow = by;
      if (isBoundaryVertex(ax, ay, active, gridSize)) { startCol = ax - dx * extend; startRow = ay - dy * extend; }
      if (isBoundaryVertex(bx, by, active, gridSize)) { endCol = bx + dx * extend; endRow = by + dy * extend; }

      const [x1, y1] = gridToOutput(startCol, startRow, cellSize);
      const [x2, y2] = gridToOutput(endCol, endRow, cellSize);
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.stroke();
    }
  }
}

// ---------------------------------------------------------------------------
// Silhouette outline = true contour of the uploaded mask
// ---------------------------------------------------------------------------

function projectMaskPoint(x: number, y: number): [number, number] {
  const content = OUTPUT_SIZE - DRAW_MARGIN * 2;
  return [DRAW_MARGIN + (x / MASK_SIZE) * content, DRAW_MARGIN + (y / MASK_SIZE) * content];
}

function getContourRings(mask: Uint8Array): Array<Array<[number, number]>> {
  const geometry = contours().size([MASK_SIZE, MASK_SIZE]).thresholds([0.5])(Array.from(mask))[0];
  const rings: Array<Array<[number, number]>> = [];
  geometry?.coordinates.forEach((polygon) => {
    polygon.forEach((ring) => {
      if (ring.length < 3) return;
      rings.push(ring.map(([x, y]) => projectMaskPoint(x, y)));
    });
  });
  return rings;
}

// Keep drawn ink inside the true mask silhouette (removes any wall overshoot
// and empties internal holes), matching the outline exactly.
function clipInkToMask(canvas: HTMLCanvasElement, mask: Uint8Array) {
  const source = document.createElement("canvas");
  source.width = MASK_SIZE;
  source.height = MASK_SIZE;
  const sourceContext = source.getContext("2d")!;
  const imageData = sourceContext.createImageData(MASK_SIZE, MASK_SIZE);
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index]) continue;
    const pixel = index * 4;
    imageData.data[pixel] = 255;
    imageData.data[pixel + 1] = 255;
    imageData.data[pixel + 2] = 255;
    imageData.data[pixel + 3] = 255;
  }
  sourceContext.putImageData(imageData, 0, 0);

  const target = createCanvas();
  const targetContext = target.getContext("2d")!;
  targetContext.imageSmoothingEnabled = true;
  targetContext.drawImage(source, DRAW_MARGIN, DRAW_MARGIN, OUTPUT_SIZE - DRAW_MARGIN * 2, OUTPUT_SIZE - DRAW_MARGIN * 2);

  const context = canvas.getContext("2d")!;
  context.save();
  context.globalCompositeOperation = "destination-in";
  context.drawImage(target, 0, 0);
  context.restore();
}

type GateOpening = { x: number; y: number; radius: number };

// Stroke the true contour, leaving a gap wherever the ring passes near a gate
// opening. The rings are already dense/smooth from marching squares, so simple
// line segments render as a clean curve.
function drawContour(
  canvas: HTMLCanvasElement,
  rings: Array<Array<[number, number]>>,
  gates: GateOpening[],
  cellSize: number,
) {
  const context = canvas.getContext("2d")!;
  context.strokeStyle = "#111";
  context.lineWidth = Math.max(4, cellSize * 0.2);
  context.lineCap = "round";
  context.lineJoin = "round";

  const nearGate = (point: [number, number]) =>
    gates.some((gate) => Math.hypot(point[0] - gate.x, point[1] - gate.y) <= gate.radius);

  rings.forEach((ring) => {
    const skip = ring.map((point) => nearGate(point));
    let drawing = false;
    for (let index = 0; index < ring.length; index += 1) {
      const nextIndex = (index + 1) % ring.length;
      if (skip[index] || skip[nextIndex]) {
        if (drawing) {
          context.stroke();
          drawing = false;
        }
        continue;
      }
      const current = ring[index];
      const next = ring[nextIndex];
      if (!drawing) {
        context.beginPath();
        context.moveTo(current[0], current[1]);
        drawing = true;
      }
      context.lineTo(next[0], next[1]);
    }
    if (drawing) context.stroke();
  });
}

function drawInternalFeatures(
  canvas: HTMLCanvasElement,
  regions: DetectedInternalRegion[],
  assignments: Record<string, InternalFeatureType>,
  offset: number,
) {
  const context = canvas.getContext("2d")!;
  const contentSize = OUTPUT_SIZE - offset * 2;
  const scale = contentSize / MASK_SIZE;
  regions.forEach((region) => {
    const type = assignments[region.id] ?? "original";
    if (type === "blank" || type === "original") return;
    const x = offset + region.centerX * scale;
    const y = offset + region.centerY * scale;
    const width = region.width * scale;
    const height = region.height * scale;
    context.save();
    context.strokeStyle = "#111";
    context.fillStyle = "#111";
    context.lineCap = "round";
    context.lineWidth = Math.max(3, Math.min(width, height) * 0.1);
    if (type === "eye") {
      const pupilRadiusX = Math.max(4, width * 0.2);
      const pupilRadiusY = Math.max(5, height * 0.26);
      context.beginPath();
      context.ellipse(x, y, pupilRadiusX, pupilRadiusY, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#fff";
      context.beginPath();
      context.arc(x - pupilRadiusX * 0.3, y - pupilRadiusY * 0.35, Math.max(2, pupilRadiusX * 0.22), 0, Math.PI * 2);
      context.fill();
    } else if (type === "mouth") {
      context.beginPath();
      context.arc(x, y - height * 0.12, width * 0.27, Math.PI * 0.12, Math.PI * 0.88);
      context.stroke();
    } else if (type === "spot") {
      context.globalAlpha = 0.18;
      context.beginPath();
      context.ellipse(x, y, width * 0.32, height * 0.32, 0, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  });
}

function drawOriginalDecorations(
  canvas: HTMLCanvasElement,
  decorations: Uint8Array,
  regions: DetectedInternalRegion[],
  assignments: Record<string, InternalFeatureType>,
  offset: number,
) {
  if (!decorations.some((value) => value === 1)) return;
  const source = document.createElement("canvas");
  source.width = MASK_SIZE;
  source.height = MASK_SIZE;
  const sourceContext = source.getContext("2d")!;
  const imageData = sourceContext.createImageData(MASK_SIZE, MASK_SIZE);
  for (let index = 0; index < decorations.length; index += 1) {
    if (!decorations[index]) continue;
    const x = index % MASK_SIZE;
    const y = Math.floor(index / MASK_SIZE);
    const owner = regions.find((region) =>
      x >= region.centerX - region.width / 2 &&
      x <= region.centerX + region.width / 2 &&
      y >= region.centerY - region.height / 2 &&
      y <= region.centerY + region.height / 2,
    );
    if (!owner || (assignments[owner.id] ?? "original") !== "original") continue;
    const pixel = index * 4;
    imageData.data[pixel] = 17;
    imageData.data[pixel + 1] = 17;
    imageData.data[pixel + 2] = 17;
    imageData.data[pixel + 3] = 255;
  }
  sourceContext.putImageData(imageData, 0, 0);
  const context = canvas.getContext("2d")!;
  context.save();
  context.imageSmoothingEnabled = true;
  context.drawImage(source, offset, offset, OUTPUT_SIZE - offset * 2, OUTPUT_SIZE - offset * 2);
  context.restore();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function detectInternalRegions(
  file: File,
  foreground: MazeForeground,
): Promise<DetectedInternalRegion[]> {
  const image = await loadImage(file);
  return findInternalRegions(buildCleanMask(image, foreground), MASK_SIZE, MASK_SIZE);
}

export async function generateIrregularMaze(
  file: File,
  foreground: MazeForeground,
  difficulty: IrregularMazeDifficulty,
  requestedSeed?: number,
  internalFeatureAssignments: Record<string, InternalFeatureType> = {},
): Promise<IrregularMazeOutput> {
  const image = await loadImage(file);
  const mask = buildCleanMask(image, foreground);
  const decorations = extractOriginalDecorations(image, foreground);
  const internalRegions = findInternalRegions(mask, MASK_SIZE, MASK_SIZE);
  const seed = requestedSeed ?? Math.floor(Math.random() * 1_000_000_000);

  const gridSizes = difficulty === "easy" ? [18, 22, 26] : [30, 36, 42];
  const variantCount = difficulty === "easy" ? 8 : 10;

  let best: MazeCandidate | null = null;
  gridSizes.forEach((gridSize) => {
    for (let variant = 0; variant < variantCount; variant += 1) {
      const candidateSeed = (seed ^ Math.imul(gridSize, 0x9e3779b1) ^ Math.imul(variant + 1, 0x85ebca6b)) >>> 0;
      const candidate = buildCandidate(mask, gridSize, candidateSeed, difficulty);
      if (candidate && (!best || candidate.score > best.score)) best = candidate;
    }
  });

  if (!best) throw new Error("无法在该轮廓内生成有效迷宫，请更换轮廓图或调整难度");
  const selected: MazeCandidate = best;
  const { gridSize, entry, exit, entrySide, exitSide, path, cellCount } = selected;
  const cellSize = (OUTPUT_SIZE - DRAW_MARGIN * 2) / gridSize;

  // Gate openings, positioned at each gate cell's outer edge and nudged toward
  // the contour so the ring is broken exactly where the solution leaves.
  const entryMid = gateEdgeMidpoint(entry, entrySide, gridSize, cellSize);
  const exitMid = gateEdgeMidpoint(exit, exitSide, gridSize, cellSize);
  const [entryDx, entryDy] = SIDE_DELTA[entrySide];
  const [exitDx, exitDy] = SIDE_DELTA[exitSide];
  const gates: GateOpening[] = [
    { x: entryMid[0] + entryDx * cellSize * 0.5, y: entryMid[1] + entryDy * cellSize * 0.5, radius: cellSize * 1.0 },
    { x: exitMid[0] + exitDx * cellSize * 0.5, y: exitMid[1] + exitDy * cellSize * 0.5, radius: cellSize * 1.0 },
  ];

  // Interior walls on their own layer, clipped to the true mask so nothing
  // overshoots the contour and internal holes stay empty.
  const wallLayer = createCanvas();
  drawInteriorWalls(wallLayer, selected, cellSize);
  clipInkToMask(wallLayer, mask);

  const contourRings = getContourRings(mask);

  const puzzleCanvas = createCanvas();
  const puzzleContext = puzzleCanvas.getContext("2d")!;
  puzzleContext.fillStyle = "#fff";
  puzzleContext.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  puzzleContext.drawImage(wallLayer, 0, 0);
  drawContour(puzzleCanvas, contourRings, gates, cellSize);
  drawOriginalDecorations(puzzleCanvas, decorations, internalRegions, internalFeatureAssignments, DRAW_MARGIN);
  drawInternalFeatures(puzzleCanvas, internalRegions, internalFeatureAssignments, DRAW_MARGIN);

  // Answer overlay: the interior solution plus the two gate stubs that reach
  // through the openings to the outside markers.
  const answer = createCanvas();
  const answerContext = answer.getContext("2d")!;
  answerContext.drawImage(puzzleCanvas, 0, 0);

  const centers: Array<[number, number]> = path.map((id) => cellCenterOutput(id, gridSize, cellSize));
  const stub = cellSize * 1.15;
  const entryOutside: [number, number] = [entryMid[0] + entryDx * stub, entryMid[1] + entryDy * stub];
  const exitOutside: [number, number] = [exitMid[0] + exitDx * stub, exitMid[1] + exitDy * stub];

  const route: Array<[number, number]> = [entryOutside, entryMid, ...centers, exitMid, exitOutside];
  answerContext.strokeStyle = "#ef4444";
  answerContext.lineWidth = Math.max(4, cellSize * 0.24);
  answerContext.lineCap = "round";
  answerContext.lineJoin = "round";
  answerContext.beginPath();
  answerContext.moveTo(route[0][0], route[0][1]);
  route.slice(1).forEach(([x, y]) => answerContext.lineTo(x, y));
  answerContext.stroke();

  const markerRadius = Math.max(7, cellSize * 0.26);
  answerContext.fillStyle = "#1677ff";
  answerContext.beginPath();
  answerContext.arc(entryOutside[0], entryOutside[1], markerRadius, 0, Math.PI * 2);
  answerContext.fill();
  answerContext.fillStyle = "#ef4444";
  answerContext.beginPath();
  answerContext.arc(exitOutside[0], exitOutside[1], markerRadius, 0, Math.PI * 2);
  answerContext.fill();

  return {
    mazeUrl: puzzleCanvas.toDataURL("image/png"),
    answerUrl: answer.toDataURL("image/png"),
    cells: cellCount,
    solutionSteps: path.length,
    seed,
    gridSize,
    difficulty,
  };
}
