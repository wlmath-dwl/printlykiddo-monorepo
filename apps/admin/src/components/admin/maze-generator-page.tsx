"use client";

import { Button, Card, Form, InputNumber, Modal, Progress, Select, Space, Tabs, Typography, message } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";

import { createBrowserZip, downloadBrowserBlob, type BrowserZipEntry } from "@/lib/browser-zip";
import {
  finalizePuzzlePublishDifficulty,
  getPuzzlePublishState,
  pausePuzzlePublish,
  startOrResumePuzzlePublish,
  uploadPuzzlePublishItem,
  type PuzzlePublishJob,
} from "@/lib/puzzle-publish-client";
import type { PuzzleCategoryRecord } from "@/lib/puzzle-local-db";

import { PuzzleActiveSwitch, PuzzleCoverEditorButton } from "./puzzle-category-manager";

export type MazeShape = "rectangle" | "circle";
export type MazeDifficulty = "easy" | "medium" | "hard";

type MazeConfig = {
  shape: MazeShape;
  difficulty: MazeDifficulty;
  title: string;
  slug: string;
  rows?: number;
  cols?: number;
  rings?: number;
  sectors?: number;
  outerDiameter?: number;
  innerDiameter?: number;
};

type FormValues = {
  shape: MazeShape;
  difficulty: MazeDifficulty;
  count: number;
  includeAnswers: boolean;
};

type RectCell = {
  row: number;
  col: number;
  visited: boolean;
  walls: {
    top: boolean;
    right: boolean;
    bottom: boolean;
    left: boolean;
  };
};

type PolarCell = {
  ring: number;
  sector: number;
  sectors: number;
  visited: boolean;
  links: Set<PolarCell>;
  walls: {
    inner: boolean;
    outer: boolean;
    ccw: boolean;
    cw: boolean;
  };
};

type MazeResult<TCell> = {
  cells: TCell[][];
  start: TCell;
  end: TCell;
  path: TCell[];
};

type DifficultyProfile = {
  algorithmLabel: string;
  candidateCount: number;
  newestCellWeight: number;
  selection: "lowestScore" | "highestScore";
  minPathBranches: number;
  scoreWeights: {
    pathLength: number;
    pathBranches: number;
    branchDepth: number;
    turns: number;
  };
};

const TILE_SIZE = 1600;
const ANSWER_PATH_COLOR = "#2b7de9";
const RECT_CONFIGS: Record<MazeDifficulty, MazeConfig> = {
  easy: {
    shape: "rectangle",
    difficulty: "easy",
    title: "Easy Rectangle Maze",
    slug: "rectangle-maze-easy",
    rows: 9,
    cols: 9,
  },
  medium: {
    shape: "rectangle",
    difficulty: "medium",
    title: "Medium Rectangle Maze",
    slug: "rectangle-maze-medium",
    rows: 14,
    cols: 14,
  },
  hard: {
    shape: "rectangle",
    difficulty: "hard",
    title: "Hard Rectangle Maze",
    slug: "rectangle-maze-hard",
    rows: 20,
    cols: 20,
  },
};
const CIRCLE_CONFIGS: Record<MazeDifficulty, MazeConfig> = {
  easy: {
    shape: "circle",
    difficulty: "easy",
    title: "Easy Circle Maze",
    slug: "circle-maze-easy",
    outerDiameter: 12,
    innerDiameter: 4,
  },
  medium: {
    shape: "circle",
    difficulty: "medium",
    title: "Medium Circle Maze",
    slug: "circle-maze-medium",
    // 对齐矩形 medium 的规模（~196 格）：7 环 × 30 扇 ≈ 210 格。
    outerDiameter: 18,
    innerDiameter: 4,
  },
  hard: {
    shape: "circle",
    difficulty: "hard",
    title: "Hard Circle Maze",
    slug: "circle-maze-hard",
    // 对齐矩形 hard 的规模（~400 格）：10 环 × 38 扇 ≈ 380 格。
    outerDiameter: 24,
    innerDiameter: 4,
  },
};

const SHAPE_OPTIONS: Array<{ label: string; value: MazeShape }> = [
  { label: "矩形迷宫", value: "rectangle" },
  { label: "圆形迷宫", value: "circle" },
];
const DIFFICULTY_OPTIONS: Array<{ label: string; value: MazeDifficulty }> = [
  { label: "Easy", value: "easy" },
  { label: "Medium", value: "medium" },
  { label: "Hard", value: "hard" },
];
const DIFFICULTY_PROFILES: Record<MazeDifficulty, DifficultyProfile> = {
  easy: {
    algorithmLabel: "Growing Tree Gentle",
    candidateCount: 16,
    newestCellWeight: 0.65,
    // easy 在“达到最低决策点数”的候选里，挑最不复杂的那个，避免给低龄孩子最绕的迷宫。
    selection: "lowestScore",
    minPathBranches: 4,
    scoreWeights: { pathLength: 0.4, pathBranches: 4, branchDepth: 0.15, turns: 0.25 },
  },
  medium: {
    algorithmLabel: "Growing Tree Balanced",
    candidateCount: 10,
    newestCellWeight: 0.45,
    selection: "highestScore",
    minPathBranches: 10,
    scoreWeights: { pathLength: 0.8, pathBranches: 3.5, branchDepth: 0.8, turns: 0.7 },
  },
  hard: {
    algorithmLabel: "Growing Tree Random Cell + Hard Filter",
    candidateCount: 32,
    newestCellWeight: 0,
    selection: "highestScore",
    minPathBranches: 18,
    scoreWeights: { pathLength: 0.7, pathBranches: 8, branchDepth: 2.2, turns: 1 },
  },
};

const SCENE_MAZE_PROMPT = `Transform the provided maze into a themed children's scene maze.

IMPORTANT:

The provided maze is the master maze structure.

Preserve the maze topology exactly.

Do NOT redesign the maze.

Do NOT generate a new maze.

Do NOT change:

- wall positions
- corridor positions
- dead ends
- junctions
- start location
- finish location
- solution path
- maze difficulty

The maze structure must remain identical to the reference maze.

--------------------------------------------------

THEME

Theme: {THEME}

--------------------------------------------------

MAZE CONVERSION

Convert the maze into a themed scene while preserving the exact maze layout.

The maze paths become:

{PATH_TYPE}

The maze walls become themed environmental barriers.

Examples:

Halloween:
- pumpkins
- gravestones
- spooky trees
- fences
- thorn bushes

Christmas:
- snow banks
- pine trees
- gift stacks
- candy canes

Easter:
- flower beds
- hedges
- Easter eggs
- carrot patches

Pirates:
- rocks
- palm trees
- wooden fences
- treasure crates

Dinosaurs:
- ferns
- rocks
- volcano debris
- prehistoric trees

--------------------------------------------------

START AND FINISH

Create a clear themed start character.

Create a clear themed destination.

Both must connect directly to the maze.

Neither may block the maze path.

The finish area must remain fully visible.

--------------------------------------------------

VISUAL RULES

The maze remains the primary focus.

The scene decorations remain secondary.

Decorations must never cover, hide, or obscure the maze.

The maze should be readable immediately from a distance.

Keep paths wide and child-friendly.

Maintain strong visual separation between paths and walls.

--------------------------------------------------

STYLE

Children's printable activity page.

Ages 5-9.

Bright colors.

Clean cartoon illustration.

Bold outlines.

Simple shapes.

Low clutter.

Large recognizable objects.

No realistic rendering.

No heavy textures.

No excessive decoration.

--------------------------------------------------

COMPOSITION

Square format.

Maze occupies approximately 80% of the image.

Theme elements decorate and enhance the maze but never replace it.

The final result should look like the original maze has been transformed into a themed environment while keeping the exact same maze structure.`;

export function getMazeConfig(shape: MazeShape, difficulty: MazeDifficulty) {
  return shape === "circle" ? CIRCLE_CONFIGS[difficulty] : RECT_CONFIGS[difficulty];
}

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function pickActiveCellIndex(length: number, newestCellWeight: number) {
  if (length <= 1 || Math.random() < newestCellWeight) {
    return length - 1;
  }
  return Math.floor(Math.random() * length);
}

type MazeMetrics = {
  complexity: number;
  pathBranches: number;
  meetsFloor: boolean;
};

function scoreMaze<TCell>(
  maze: MazeResult<TCell>,
  getOpenNeighbors: (cell: TCell) => TCell[],
  getTurnKey: (from: TCell, to: TCell) => string,
  difficulty: MazeDifficulty,
): MazeMetrics {
  const profile = DIFFICULTY_PROFILES[difficulty];
  const pathSet = new Set(maze.path);
  let pathBranches = 0;
  let branchDepth = 0;
  let turns = 0;
  let previousDirection = "";

  for (let index = 0; index < maze.path.length; index += 1) {
    const cell = maze.path[index];
    const openNeighbors = getOpenNeighbors(cell);
    const offPathNeighbors = openNeighbors.filter((neighbor) => !pathSet.has(neighbor));
    if (offPathNeighbors.length > 0) {
      pathBranches += offPathNeighbors.length;
      branchDepth += offPathNeighbors.reduce(
        (sum, neighbor) => sum + measureBranchDepth(neighbor, cell, pathSet, getOpenNeighbors),
        0,
      );
    }

    const next = maze.path[index + 1];
    if (next) {
      const direction = getTurnKey(cell, next);
      if (previousDirection && direction !== previousDirection) {
        turns += 1;
      }
      previousDirection = direction;
    }
  }

  // complexity 只表示“这个迷宫有多难”，不再把 floor 惩罚混进分值里；
  // 是否达标（meetsFloor）单独判断，交给选优逻辑处理。
  const complexity =
    maze.path.length * profile.scoreWeights.pathLength +
    pathBranches * profile.scoreWeights.pathBranches +
    branchDepth * profile.scoreWeights.branchDepth +
    turns * profile.scoreWeights.turns;

  return {
    complexity,
    pathBranches,
    meetsFloor: pathBranches >= profile.minPathBranches,
  };
}

// 选优：先保证达到该难度的最小决策点数（floor），再在达标的候选里按方向取舍——
// easy 取“最不复杂”的（更适合低龄），medium/hard 取“最复杂”的。
// 若没有候选达标，则退而取决策点最多（最接近 floor）的那个。
function isBetterMazeCandidate(
  candidate: MazeMetrics,
  best: MazeMetrics,
  profile: DifficultyProfile,
) {
  if (candidate.meetsFloor !== best.meetsFloor) {
    return candidate.meetsFloor;
  }
  if (!candidate.meetsFloor) {
    return candidate.pathBranches > best.pathBranches;
  }
  return profile.selection === "lowestScore"
    ? candidate.complexity < best.complexity
    : candidate.complexity > best.complexity;
}

function measureBranchDepth<TCell>(
  start: TCell,
  blocked: TCell,
  pathSet: Set<TCell>,
  getOpenNeighbors: (cell: TCell) => TCell[],
) {
  const queue: Array<{ cell: TCell; depth: number }> = [{ cell: start, depth: 1 }];
  const visited = new Set<TCell>([blocked, start]);
  let maxDepth = 1;

  for (let index = 0; index < queue.length; index += 1) {
    const { cell, depth } = queue[index];
    maxDepth = Math.max(maxDepth, depth);
    for (const neighbor of getOpenNeighbors(cell)) {
      if (visited.has(neighbor) || pathSet.has(neighbor)) {
        continue;
      }
      visited.add(neighbor);
      queue.push({ cell: neighbor, depth: depth + 1 });
    }
  }

  return maxDepth;
}

function createRectGrid(rows: number, cols: number) {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => ({
      row,
      col,
      visited: false,
      walls: { top: true, right: true, bottom: true, left: true },
    })),
  );
}

function getRectNeighbors(grid: RectCell[][], cell: RectCell) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  return [
    cell.row > 0 ? grid[cell.row - 1][cell.col] : null,
    cell.col < cols - 1 ? grid[cell.row][cell.col + 1] : null,
    cell.row < rows - 1 ? grid[cell.row + 1][cell.col] : null,
    cell.col > 0 ? grid[cell.row][cell.col - 1] : null,
  ].filter((item): item is RectCell => Boolean(item));
}

function carveRectWall(a: RectCell, b: RectCell) {
  if (b.row === a.row - 1) {
    a.walls.top = false;
    b.walls.bottom = false;
  } else if (b.col === a.col + 1) {
    a.walls.right = false;
    b.walls.left = false;
  } else if (b.row === a.row + 1) {
    a.walls.bottom = false;
    b.walls.top = false;
  } else if (b.col === a.col - 1) {
    a.walls.left = false;
    b.walls.right = false;
  }
}

function canMoveRect(a: RectCell, b: RectCell) {
  if (b.row === a.row - 1) return !a.walls.top;
  if (b.col === a.col + 1) return !a.walls.right;
  if (b.row === a.row + 1) return !a.walls.bottom;
  if (b.col === a.col - 1) return !a.walls.left;
  return false;
}

function getOpenRectNeighbors(grid: RectCell[][], cell: RectCell) {
  return getRectNeighbors(grid, cell).filter((neighbor) => canMoveRect(cell, neighbor));
}

function getRectDirection(a: RectCell, b: RectCell) {
  if (b.row !== a.row) return "vertical";
  return "horizontal";
}

function findPath<TCell>(
  start: TCell,
  end: TCell,
  getNeighbors: (cell: TCell) => TCell[],
) {
  const queue = [start];
  const previous = new Map<TCell, TCell | null>([[start, null]]);

  for (let index = 0; index < queue.length; index += 1) {
    const cell = queue[index];
    if (cell === end) {
      break;
    }
    for (const neighbor of getNeighbors(cell)) {
      if (!previous.has(neighbor)) {
        previous.set(neighbor, cell);
        queue.push(neighbor);
      }
    }
  }

  const path: TCell[] = [];
  let current: TCell | null | undefined = end;
  while (current) {
    path.push(current);
    current = previous.get(current);
  }
  return path.reverse();
}

function generateRectMazeCandidate(config: MazeConfig): MazeResult<RectCell> {
  const rows = config.rows ?? 10;
  const cols = config.cols ?? 10;
  const profile = DIFFICULTY_PROFILES[config.difficulty];
  const grid = createRectGrid(rows, cols);
  const start = grid[0][0];
  const activeCells = [start];
  start.visited = true;

  while (activeCells.length > 0) {
    const activeIndex = pickActiveCellIndex(activeCells.length, profile.newestCellWeight);
    const current = activeCells[activeIndex];
    const next = shuffle(getRectNeighbors(grid, current).filter((cell) => !cell.visited))[0];
    if (!next) {
      activeCells.splice(activeIndex, 1);
      continue;
    }
    carveRectWall(current, next);
    next.visited = true;
    activeCells.push(next);
  }

  const end = grid[rows - 1][cols - 1];
  start.walls.top = false;
  end.walls.bottom = false;
  const path = findPath(start, end, (cell) => getOpenRectNeighbors(grid, cell));
  return { cells: grid, start, end, path };
}

function generateRectMaze(config: MazeConfig): MazeResult<RectCell> {
  const profile = DIFFICULTY_PROFILES[config.difficulty];
  let bestMaze = generateRectMazeCandidate(config);
  let bestMetrics = scoreMaze(
    bestMaze,
    (cell) => getOpenRectNeighbors(bestMaze.cells, cell),
    getRectDirection,
    config.difficulty,
  );

  for (let index = 1; index < profile.candidateCount; index += 1) {
    const maze = generateRectMazeCandidate(config);
    const metrics = scoreMaze(
      maze,
      (cell) => getOpenRectNeighbors(maze.cells, cell),
      getRectDirection,
      config.difficulty,
    );
    if (isBetterMazeCandidate(metrics, bestMetrics, profile)) {
      bestMaze = maze;
      bestMetrics = metrics;
    }
  }

  return bestMaze;
}

function normalizeThetaDiameter(outerDiameter: number, innerDiameter: number) {
  const outer = Math.max(5, Math.round(outerDiameter));
  const boundedInner = Math.max(3, Math.min(outer - 2, Math.round(innerDiameter)));
  const inner = (outer - boundedInner) % 2 === 0 ? boundedInner : boundedInner + 1;
  return {
    outer,
    inner: Math.max(3, Math.min(outer - 2, inner)),
  };
}

function getThetaSectorCount(outerDiameter: number) {
  const raw = Math.round(outerDiameter * 1.6);
  return Math.max(12, Math.round(raw / 2) * 2);
}

function createPolarGrid(outerDiameter: number, innerDiameter: number) {
  const { outer, inner } = normalizeThetaDiameter(outerDiameter, innerDiameter);
  const rings = Math.max(1, Math.floor((outer - inner) / 2));
  const sectors = getThetaSectorCount(outer);
  return Array.from({ length: rings }, (_, ring) => {
    return Array.from({ length: sectors }, (_, sector) => ({
      ring,
      sector,
      sectors,
      visited: false,
      links: new Set<PolarCell>(),
      walls: { inner: true, outer: true, ccw: true, cw: true },
    }));
  });
}

function getThetaOverlapRange(a: PolarCell, b: PolarCell) {
  const aStart = a.sector / a.sectors;
  const aEnd = (a.sector + 1) / a.sectors;
  const bStart = b.sector / b.sectors;
  const bEnd = (b.sector + 1) / b.sectors;
  const start = Math.max(aStart, bStart);
  const end = Math.min(aEnd, bEnd);
  return end > start ? { start, end } : null;
}

function getThetaOverlappingCells(targetRing: PolarCell[], startAngle: number, endAngle: number) {
  return targetRing.filter((candidate) => {
    const candidateStart = candidate.sector / candidate.sectors;
    const candidateEnd = (candidate.sector + 1) / candidate.sectors;
    return candidateStart < endAngle && candidateEnd > startAngle;
  });
}

function getPolarNeighbors(grid: PolarCell[][], cell: PolarCell) {
  const ring = grid[cell.ring];
  const startAngle = cell.sector / cell.sectors;
  const endAngle = (cell.sector + 1) / cell.sectors;
  const neighbors = [
    ring[(cell.sector - 1 + cell.sectors) % cell.sectors],
    ring[(cell.sector + 1) % cell.sectors],
  ];

  if (cell.ring > 0) {
    neighbors.push(...getThetaOverlappingCells(grid[cell.ring - 1], startAngle, endAngle));
  }
  if (cell.ring < grid.length - 1) {
    neighbors.push(...getThetaOverlappingCells(grid[cell.ring + 1], startAngle, endAngle));
  }

  return Array.from(new Set(neighbors));
}

function areCircularNeighbors(a: PolarCell, b: PolarCell) {
  if (a.ring !== b.ring) return false;
  const delta = Math.abs(a.sector - b.sector);
  return delta === 1 || delta === a.sectors - 1;
}

function carvePolarWall(a: PolarCell, b: PolarCell) {
  a.links.add(b);
  b.links.add(a);

  if (b.ring === a.ring - 1) {
    a.walls.inner = false;
  } else if (b.ring === a.ring + 1) {
    b.walls.inner = false;
  } else if (areCircularNeighbors(a, b)) {
    const aIsCcwOfB = (a.sector + 1) % a.sectors === b.sector;
    if (aIsCcwOfB) {
      a.walls.cw = false;
      b.walls.ccw = false;
    } else {
      a.walls.ccw = false;
      b.walls.cw = false;
    }
  }
}

function canMovePolar(a: PolarCell, b: PolarCell) {
  return a.links.has(b);
}

function getOpenPolarNeighbors(grid: PolarCell[][], cell: PolarCell) {
  return getPolarNeighbors(grid, cell).filter((neighbor) => canMovePolar(cell, neighbor));
}

function getPolarDirection(a: PolarCell, b: PolarCell) {
  if (b.ring !== a.ring) return "radial";
  return "circular";
}

function orderPolarNeighbors(grid: PolarCell[][], cell: PolarCell, difficulty: MazeDifficulty) {
  const circular: PolarCell[] = [];
  const radial: PolarCell[] = [];
  for (const neighbor of getPolarNeighbors(grid, cell)) {
    if (neighbor.ring === cell.ring) {
      circular.push(neighbor);
    } else {
      radial.push(neighbor);
    }
  }
  const circularBias = difficulty === "hard" ? 0.62 : difficulty === "medium" ? 0.7 : 0.78;
  return Math.random() < circularBias
    ? [...shuffle(circular), ...shuffle(radial)]
    : shuffle([...circular, ...radial]);
}

function generateCircleMazeCandidate(config: MazeConfig): MazeResult<PolarCell> {
  const outerDiameter = config.outerDiameter ?? 20;
  const innerDiameter = config.innerDiameter ?? 4;
  const profile = DIFFICULTY_PROFILES[config.difficulty];
  const grid = createPolarGrid(outerDiameter, innerDiameter);
  const outerRing = grid[grid.length - 1];
  const start = outerRing[0];
  const activeCells = [start];
  start.visited = true;

  while (activeCells.length > 0) {
    const activeIndex = pickActiveCellIndex(activeCells.length, profile.newestCellWeight);
    const current = activeCells[activeIndex];
    const next = orderPolarNeighbors(grid, current, config.difficulty).find((cell) => !cell.visited);
    if (!next) {
      activeCells.splice(activeIndex, 1);
      continue;
    }
    carvePolarWall(current, next);
    next.visited = true;
    activeCells.push(next);
  }

  const innerRing = grid[0];
  const end = innerRing[Math.floor(innerRing.length / 2)];
  start.walls.outer = false;
  end.walls.inner = false;
  const path = findPath(start, end, (cell) => getOpenPolarNeighbors(grid, cell));
  return { cells: grid, start, end, path };
}

function generateCircleMaze(config: MazeConfig): MazeResult<PolarCell> {
  const profile = DIFFICULTY_PROFILES[config.difficulty];
  let bestMaze = generateCircleMazeCandidate(config);
  let bestMetrics = scoreMaze(
    bestMaze,
    (cell) => getOpenPolarNeighbors(bestMaze.cells, cell),
    getPolarDirection,
    config.difficulty,
  );

  for (let index = 1; index < profile.candidateCount; index += 1) {
    const maze = generateCircleMazeCandidate(config);
    const metrics = scoreMaze(
      maze,
      (cell) => getOpenPolarNeighbors(maze.cells, cell),
      getPolarDirection,
      config.difficulty,
    );
    if (isBetterMazeCandidate(metrics, bestMetrics, profile)) {
      bestMaze = maze;
      bestMetrics = metrics;
    }
  }

  return bestMaze;
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  width: number,
) {
  ctx.lineWidth = width;
  ctx.lineCap = "butt";
  ctx.strokeStyle = "#202020";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  points: Array<{ x: number; y: number }>,
  width: number,
) {
  if (points.length === 0) {
    return;
  }
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = ANSWER_PATH_COLOR;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (const point of points.slice(1)) {
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
}

function renderRectMaze(config: MazeConfig, maze: MazeResult<RectCell>, answerKey: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布。");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  const rows = config.rows ?? 10;
  const cols = config.cols ?? 10;
  const margin = 150;
  const cellSize = Math.floor((TILE_SIZE - margin * 2) / Math.max(rows, cols));
  const gridWidth = cols * cellSize;
  const gridHeight = rows * cellSize;
  const x = Math.round((TILE_SIZE - gridWidth) / 2);
  const y = Math.round((TILE_SIZE - gridHeight) / 2);
  const wallWidth = config.difficulty === "hard" ? 5 : 7;

  if (answerKey) {
    drawPath(
      ctx,
      maze.path.map((cell) => ({
        x: x + cell.col * cellSize + cellSize / 2,
        y: y + cell.row * cellSize + cellSize / 2,
      })),
      Math.max(14, Math.round(cellSize * 0.2)),
    );
  }

  for (const row of maze.cells) {
    for (const cell of row) {
      const left = x + cell.col * cellSize;
      const top = y + cell.row * cellSize;
      const right = left + cellSize;
      const bottom = top + cellSize;
      if (cell.walls.top) drawLine(ctx, left, top, right, top, wallWidth);
      if (cell.walls.right) drawLine(ctx, right, top, right, bottom, wallWidth);
      if (cell.walls.bottom) drawLine(ctx, left, bottom, right, bottom, wallWidth);
      if (cell.walls.left) drawLine(ctx, left, top, left, bottom, wallWidth);
    }
  }

  return canvas;
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

function drawArc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  width: number,
) {
  ctx.lineWidth = width;
  ctx.lineCap = "butt";
  ctx.strokeStyle = "#202020";
  ctx.beginPath();
  ctx.arc(cx, cy, radius, startAngle, endAngle);
  ctx.stroke();
}

function drawThetaArcSegment(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  startAngleOffset: number,
  start: number,
  end: number,
  width: number,
) {
  if (end - start < 0.0001) {
    return;
  }
  drawArc(
    ctx,
    cx,
    cy,
    radius,
    startAngleOffset + start * Math.PI * 2,
    startAngleOffset + end * Math.PI * 2,
    width,
  );
}

function getPolarCellRadius(innerRoomRadius: number, ringSize: number, cell: PolarCell) {
  return innerRoomRadius + cell.ring * ringSize + ringSize / 2;
}

function getPolarCellAngle(startAngleOffset: number, cell: PolarCell) {
  return startAngleOffset + (cell.sector + 0.5) * (Math.PI * 2 / cell.sectors);
}

function getPolarCellAngleRange(cell: PolarCell) {
  return {
    start: cell.sector / cell.sectors,
    end: (cell.sector + 1) / cell.sectors,
  };
}

function normalizeAngleDelta(delta: number) {
  let next = delta;
  while (next > Math.PI) next -= Math.PI * 2;
  while (next < -Math.PI) next += Math.PI * 2;
  return next;
}

function drawSolutionArc(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  fromAngle: number,
  toAngle: number,
) {
  const delta = normalizeAngleDelta(toAngle - fromAngle);
  if (Math.abs(delta) < 0.0001) {
    return;
  }
  ctx.arc(cx, cy, radius, fromAngle, fromAngle + delta, delta < 0);
}

function drawPolarSolutionPath(
  ctx: CanvasRenderingContext2D,
  maze: MazeResult<PolarCell>,
  cx: number,
  cy: number,
  innerRoomRadius: number,
  outerRadius: number,
  ringSize: number,
  width: number,
) {
  const first = maze.path[0];
  if (!first) {
    return;
  }

  const startAngleOffset = -Math.PI / 2;
  let currentRadius = getPolarCellRadius(innerRoomRadius, ringSize, first);
  let currentAngle = getPolarCellAngle(startAngleOffset, first);
  const startPoint = polarPoint(cx, cy, outerRadius + ringSize * 0.35, currentAngle);
  const firstCenter = polarPoint(cx, cy, currentRadius, currentAngle);

  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = ANSWER_PATH_COLOR;
  ctx.beginPath();
  ctx.moveTo(startPoint.x, startPoint.y);
  ctx.lineTo(firstCenter.x, firstCenter.y);

  for (let index = 1; index < maze.path.length; index += 1) {
    const previous = maze.path[index - 1];
    const cell = maze.path[index];
    const nextRadius = getPolarCellRadius(innerRoomRadius, ringSize, cell);
    const nextAngle = getPolarCellAngle(startAngleOffset, cell);

    if (previous.ring === cell.ring) {
      drawSolutionArc(ctx, cx, cy, currentRadius, currentAngle, nextAngle);
    } else {
      const previousRange = getPolarCellAngleRange(previous);
      const cellRange = getPolarCellAngleRange(cell);
      const overlapStart = Math.max(previousRange.start, cellRange.start);
      const overlapEnd = Math.min(previousRange.end, cellRange.end);
      const overlapAngle =
        startAngleOffset + ((overlapStart + overlapEnd) / 2) * Math.PI * 2;
      drawSolutionArc(ctx, cx, cy, currentRadius, currentAngle, overlapAngle);
      const radialPoint = polarPoint(cx, cy, nextRadius, overlapAngle);
      ctx.lineTo(radialPoint.x, radialPoint.y);
      drawSolutionArc(ctx, cx, cy, nextRadius, overlapAngle, nextAngle);
    }

    currentRadius = nextRadius;
    currentAngle = nextAngle;
  }

  if (!maze.end.walls.inner) {
    const endPoint = polarPoint(cx, cy, innerRoomRadius * 0.48, currentAngle);
    ctx.lineTo(endPoint.x, endPoint.y);
  }

  ctx.stroke();
}

function renderCircleMaze(config: MazeConfig, maze: MazeResult<PolarCell>, answerKey: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建画布。");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  const cx = TILE_SIZE / 2;
  const cy = TILE_SIZE / 2;
  const outerRadius = 650;
  const { outer, inner } = normalizeThetaDiameter(
    config.outerDiameter ?? config.sectors ?? 20,
    config.innerDiameter ?? 4,
  );
  const ringSize = outerRadius / (outer / 2);
  const innerRoomRadius = (inner / 2) * ringSize;
  const wallWidth = config.difficulty === "hard" ? 5 : 7;
  const startAngleOffset = -Math.PI / 2;

  if (answerKey) {
    drawPolarSolutionPath(
      ctx,
      maze,
      cx,
      cy,
      innerRoomRadius,
      outerRadius,
      ringSize,
      Math.max(14, Math.round(ringSize * 0.2)),
    );
  }

  for (const ring of maze.cells) {
    for (const cell of ring) {
      const innerRadius = innerRoomRadius + cell.ring * ringSize;
      const outerCellRadius = innerRadius + ringSize;
      const start = cell.sector / cell.sectors;
      const end = (cell.sector + 1) / cell.sectors;
      const a0 = startAngleOffset + start * Math.PI * 2;

      if (cell.ring === 0) {
        if (cell !== maze.end || cell.walls.inner) {
          drawThetaArcSegment(ctx, cx, cy, innerRadius, startAngleOffset, start, end, wallWidth);
        }
      } else {
        const innerNeighbors = getThetaOverlappingCells(maze.cells[cell.ring - 1], start, end);
        for (const innerNeighbor of innerNeighbors) {
          const overlap = getThetaOverlapRange(cell, innerNeighbor);
          if (!overlap || cell.links.has(innerNeighbor)) {
            continue;
          }
          drawThetaArcSegment(
            ctx,
            cx,
            cy,
            innerRadius,
            startAngleOffset,
            overlap.start,
            overlap.end,
            wallWidth,
          );
        }
      }

      if (cell.ring === maze.cells.length - 1) {
        if (cell !== maze.start || cell.walls.outer) {
          drawThetaArcSegment(ctx, cx, cy, outerCellRadius, startAngleOffset, start, end, wallWidth);
        }
      }

      const ccwNeighbor = ring[(cell.sector - 1 + cell.sectors) % cell.sectors];
      if (!cell.links.has(ccwNeighbor)) {
        const p1 = polarPoint(cx, cy, innerRadius, a0);
        const p2 = polarPoint(cx, cy, outerCellRadius, a0);
        drawLine(ctx, p1.x, p1.y, p2.x, p2.y, wallWidth);
      }
    }
  }

  return canvas;
}

export function renderMazeImages(config: MazeConfig) {
  if (config.shape === "circle") {
    const maze = generateCircleMaze(config);
    return {
      puzzleImage: renderCircleMaze(config, maze, false),
      answerImage: renderCircleMaze(config, maze, true),
    };
  }
  const maze = generateRectMaze(config);
  return {
    puzzleImage: renderRectMaze(config, maze, false),
    answerImage: renderRectMaze(config, maze, true),
  };
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("图片导出失败。"));
        return;
      }
      resolve(blob);
    }, "image/png");
  });
}

type ManagedPuzzlePage = {
  assets: Array<{
    id: number;
    difficulty: string;
    asset_kind: "puzzle" | "answer";
    image_url: string;
    local_file_path: string;
    sort_order: number;
  }>;
  publish_job?: PuzzlePublishJob | null;
};

export function MazeGeneratorPage({
  fixedShape,
  managedPageSlug,
  managedCategory,
}: {
  fixedShape?: MazeShape;
  managedPageSlug?: string;
  managedCategory?: PuzzleCategoryRecord;
} = {}) {
  const [form] = Form.useForm<FormValues>();
  const [messageApi, contextHolder] = message.useMessage();
  const [generating, setGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{ percent: number; label: string } | null>(null);
  const [publishJob, setPublishJob] = useState<PuzzlePublishJob | null>(null);
  const processingRef = useRef(false);
  const pauseRequestedRef = useRef(false);
  const mountedRef = useRef(true);
  const [scenePromptOpen, setScenePromptOpen] = useState(false);
  const [managedPage, setManagedPage] = useState<ManagedPuzzlePage | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<MazeDifficulty, { puzzle: string; answer: string }>>>({});
  const watchedShape = Form.useWatch("shape", form) ?? "rectangle";
  const selectedShape = fixedShape ?? watchedShape;
  const selectedDifficulty = Form.useWatch("difficulty", form) ?? "easy";
  const config = useMemo(
    () => getMazeConfig(selectedShape, selectedDifficulty),
    [selectedDifficulty, selectedShape],
  );

  useEffect(() => {
    if (!managedPageSlug) return;
    getPuzzlePublishState<ManagedPuzzlePage>(managedPageSlug)
      .then((page) => {
        setManagedPage(page);
        setPublishJob(page.publish_job);
        if (page.publish_job && page.publish_job.status !== "completed") {
          const completed = page.publish_job.difficulty_index * 48 + page.publish_job.item_index;
          const total = DIFFICULTY_OPTIONS.length * 48;
          setGenerationProgress({
            percent: Math.round((completed / total) * 100),
            label: page.publish_job.status === "paused"
              ? `已暂停，已完成 ${completed}/${total} 组题目和答案`
              : page.publish_job.status === "failed"
                ? `任务上次中断，已完成 ${completed}/${total}，点击继续恢复`
                : `正在恢复任务，已完成 ${completed}/${total}`,
          });
        }
        if (page.publish_job?.status === "running") void runResumablePublish(page.publish_job);
      })
      .catch(() => setManagedPage(null));
  }, [managedPageSlug]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pauseRequestedRef.current = true;
    };
  }, []);

  function handlePreview(difficulty: MazeDifficulty) {
    try {
      const previewConfig = getMazeConfig(selectedShape, difficulty);
      const { puzzleImage, answerImage } = renderMazeImages(previewConfig);
      setPreviews((current) => ({
        ...current,
        [difficulty]: {
          puzzle: puzzleImage.toDataURL("image/png"),
          answer: answerImage.toDataURL("image/png"),
        },
      }));
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "生成预览失败。");
    }
  }

  async function buildBatch(values: FormValues, onGenerated?: (current: number, total: number) => void) {
    const currentConfig = getMazeConfig(values.shape, values.difficulty);
    const count = Math.max(1, Math.min(300, Number(values.count ?? 1)));
    const entries: BrowserZipEntry[] = [];
    const publishForm = managedPageSlug ? new FormData() : null;
    publishForm?.set("difficulty", values.difficulty);
    for (let index = 1; index <= count; index += 1) {
      const { puzzleImage, answerImage } = renderMazeImages(currentConfig);
      const baseFileName = `${currentConfig.slug}-${String(index).padStart(3, "0")}.png`;
      const puzzleBlob = await canvasToBlob(puzzleImage);
      entries.push({ name: `puzzles/${baseFileName}`, data: new Uint8Array(await puzzleBlob.arrayBuffer()) });
      publishForm?.append("puzzles", puzzleBlob, baseFileName);
      if (values.includeAnswers) {
        const answerBlob = await canvasToBlob(answerImage);
        entries.push({ name: `answers/${baseFileName}`, data: new Uint8Array(await answerBlob.arrayBuffer()) });
        publishForm?.append("answers", answerBlob, baseFileName);
      }
      if (index % 10 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
      onGenerated?.(index, count);
    }
    return { currentConfig, count, entries, publishForm };
  }

  async function runResumablePublish(initialJob?: PuzzlePublishJob) {
    if (!fixedShape || !managedPageSlug) return;
    if (processingRef.current) return;
    processingRef.current = true;
    pauseRequestedRef.current = false;
    setGenerating(true);
    try {
      const difficulties = DIFFICULTY_OPTIONS.map((item) => item.value);
      const countPerDifficulty = 48;
      const totalItems = difficulties.length * countPerDifficulty;
      let job = initialJob ?? (await startOrResumePuzzlePublish(managedPageSlug)).publish_job;
      setPublishJob(job);
      while (mountedRef.current && !pauseRequestedRef.current && job.status === "running" && job.difficulty_index < difficulties.length) {
        const difficulty = difficulties[job.difficulty_index];
        const difficultyLabel = difficulty[0].toUpperCase() + difficulty.slice(1);
        if (job.item_index < countPerDifficulty) {
          const index = job.item_index;
          setGenerationProgress({
            percent: Math.round(((job.difficulty_index * countPerDifficulty + index) / totalItems) * 100),
            label: `正在生成并上传 ${difficultyLabel}：${index}/${countPerDifficulty}（题目 ${index}，答案 ${index}）`,
          });
          const { puzzleImage, answerImage } = renderMazeImages(getMazeConfig(fixedShape, difficulty));
          const puzzleBlob = await canvasToBlob(puzzleImage);
          const answerBlob = await canvasToBlob(answerImage);
          const fileName = `${fixedShape}-${difficulty}-${String(index + 1).padStart(3, "0")}.png`;
          job = (await uploadPuzzlePublishItem({ slug: managedPageSlug, difficulty, index, puzzle: puzzleBlob, answer: answerBlob, fileName })).job;
          setPublishJob(job);
          setGenerationProgress({
            percent: Math.round(((job.difficulty_index * countPerDifficulty + job.item_index) / totalItems) * 100),
            label: `已上传 ${difficultyLabel}：题目 ${job.item_index}/${countPerDifficulty}，答案 ${job.item_index}/${countPerDifficulty}`,
          });
          continue;
        }
        setGenerationProgress({
          percent: Math.round((((job.difficulty_index + 1) * countPerDifficulty) / totalItems) * 100),
          label: `正在发布 ${difficultyLabel} 并准备清理旧图…`,
        });
        await finalizePuzzlePublishDifficulty<ManagedPuzzlePage>(managedPageSlug, (event) => setGenerationProgress({
          percent: Math.round((((job.difficulty_index + 1) * countPerDifficulty) / totalItems) * 100),
          label: `正在清理 ${difficultyLabel} 旧图：${event.current}/${event.total}`,
        }));
        const state = await getPuzzlePublishState<ManagedPuzzlePage>(managedPageSlug);
        setManagedPage(state);
        job = state.publish_job!;
        setPublishJob(job);
      }
      if (job.status === "completed") {
        setGenerationProgress({ percent: 100, label: "全部生成并发布完成" });
        messageApi.success("已生成并发布 Easy / Medium / Hard，共 144 张迷宫和配套答案。");
      } else if (pauseRequestedRef.current || job.status === "paused") {
        setGenerationProgress((current) => ({ percent: current?.percent ?? 0, label: "已暂停，点击继续可从当前进度接着处理" }));
      }
    } catch (error) {
      if (!pauseRequestedRef.current) setGenerationProgress((current) => ({ percent: current?.percent ?? 0, label: "任务中断，点击继续将从已上传进度恢复" }));
      if (!pauseRequestedRef.current) messageApi.error(error instanceof Error ? error.message : "生成全部迷宫失败。");
    } finally {
      processingRef.current = false;
      setGenerating(false);
    }
  }

  async function handleGenerateAll() {
    await runResumablePublish();
  }

  async function handlePause() {
    if (!managedPageSlug) return;
    pauseRequestedRef.current = true;
    const result = await pausePuzzlePublish(managedPageSlug);
    setPublishJob(result.publish_job);
    setGenerationProgress((current) => ({ percent: current?.percent ?? 0, label: "正在安全暂停，当前图片上传完成后停止…" }));
  }

  async function handleGenerate(values: FormValues) {
    setGenerating(true);

    try {
      const { currentConfig, count, entries } = await buildBatch(values);
      const zip = createBrowserZip(entries);
      downloadBrowserBlob(
        zip,
        `${currentConfig.slug}-${count}-mazes${values.includeAnswers ? "-with-answers" : ""}.zip`,
      );
      messageApi.success(`已生成 ${count} 张 ${currentConfig.title}，并打包为 zip。`);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "生成迷宫图片失败。");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      {contextHolder}
      <Card
        title="迷宫生成器"
        extra={managedCategory ? <Space wrap><PuzzleActiveSwitch category={managedCategory} /><PuzzleCoverEditorButton category={managedCategory} label="编辑页面封面" /></Space> : null}
        variant="borderless"
      >
        <Typography.Paragraph type="secondary">
          {managedPageSlug
            ? "固定迷宫页面编辑器。按难度预览，生成后写入本地专用数据表并将题目图和答案图同步到线上图床。"
            : "生成黑白低墨量迷宫题图，可选矩形或圆形。Easy 会在答案路径上保留少量浅分叉，Medium / Hard 使用更强的 Growing Tree 标准变体控制分叉、假路深度和路径曲折度。每张答案图会标出唯一通路；输出为 zip，不会写入图片库。"}
        </Typography.Paragraph>

        {managedPageSlug ? (
          <div>
            <Typography.Paragraph>
              固定生成：Easy / Medium / Hard，每个难度 48 张迷宫，并生成对应答案图。
            </Typography.Paragraph>
            <Space>
              <Button type="primary" size="large" disabled={generating} onClick={() => void handleGenerateAll()}>
                {publishJob && publishJob.status !== "completed" ? "继续生成并发布" : "一键生成全部并发布"}
              </Button>
              <Button size="large" disabled={!generating} onClick={() => void handlePause()}>暂停</Button>
            </Space>
            {generationProgress ? (
              <div style={{ maxWidth: 640, marginTop: 18 }}>
                <Progress percent={generationProgress.percent} status={generating ? "active" : generationProgress.percent === 100 ? "success" : "normal"} />
                <Typography.Text type="secondary">{generationProgress.label}</Typography.Text>
              </div>
            ) : null}
          </div>
        ) : (
        <Form<FormValues>
          form={form}
          layout="vertical"
          initialValues={{
            shape: fixedShape ?? "rectangle",
            difficulty: "easy",
            count: managedPageSlug ? 48 : 1,
            includeAnswers: true,
          }}
          onFinish={(values) => void handleGenerate(values)}
          style={{ maxWidth: 720 }}
        >
          {fixedShape ? null : (
            <Form.Item label="形状" name="shape" rules={[{ required: true }]}>
              <Select options={SHAPE_OPTIONS} />
            </Form.Item>
          )}

          <Form.Item label="难度" name="difficulty" rules={[{ required: true }]}>
            <Select options={DIFFICULTY_OPTIONS} />
          </Form.Item>

          <Form.Item
            label="生成图片数量"
            name="count"
            rules={[{ required: true, message: "请输入生成数量" }]}
            extra="表示生成多少张单独的迷宫题目图。答案图如果开启，会作为配套图片一起放入 zip。"
          >
            <InputNumber min={1} max={300} precision={0} style={{ width: "100%" }} />
          </Form.Item>

          <Form.Item label="答案页" name="includeAnswers">
            <Select
              options={[
                { label: "同时下载答案图", value: true },
                { label: "只下载题目图", value: false },
              ]}
            />
          </Form.Item>

          <Space>
            <Button type="primary" htmlType="submit" loading={generating}>
              {managedPageSlug ? "一键生成、上传并发布" : "生成并下载 ZIP"}
            </Button>
            <Button onClick={() => setScenePromptOpen(true)}>场景迷宫提示词</Button>
            <Typography.Text type="secondary">
              当前版式：{config.title}
              {config.shape === "rectangle"
                ? `，${config.rows}×${config.cols}`
                : `，外径 ${config.outerDiameter} / 内径 ${config.innerDiameter}`}
              ，{DIFFICULTY_PROFILES[config.difficulty].algorithmLabel}
            </Typography.Text>
          </Space>
        </Form>
        )}
      </Card>
      {managedPageSlug ? (
        <Card title="难度预览与已发布图片" variant="borderless" style={{ marginTop: 16 }}>
          <Tabs
            items={DIFFICULTY_OPTIONS.map(({ value: difficulty, label }) => {
              const preview = previews[difficulty];
              const publishedAssets = (managedPage?.assets ?? []).filter(
                (asset) => asset.asset_kind === "puzzle" && asset.difficulty === difficulty,
              );
              return {
                key: difficulty,
                label: `${label} (${publishedAssets.length})`,
                children: (
                <div>
                  <Button onClick={() => handlePreview(difficulty)}>生成一组 {label} 预览</Button>
                  {preview ? (
                    <Space align="start" wrap style={{ marginTop: 12 }}>
                      <img src={preview.puzzle} alt={`${difficulty} 迷宫题目预览`} style={{ width: 280, maxWidth: "100%", border: "1px solid #eee" }} />
                      <img src={preview.answer} alt={`${difficulty} 迷宫答案预览`} style={{ width: 280, maxWidth: "100%", border: "1px solid #eee" }} />
                    </Space>
                  ) : null}
                  <Typography.Title level={5} style={{ marginTop: 24 }}>已发布 {label} 图片</Typography.Title>
                  <Space align="start" wrap>
                    {publishedAssets.map((asset) => {
                      const query = new URLSearchParams({ path: asset.image_url, local_file_path: asset.local_file_path });
                      return <img key={asset.id} src={`/api/admin/imgs/preview?${query}`} alt={`${asset.difficulty} 迷宫`} style={{ width: 180, border: "1px solid #eee" }} />;
                    })}
                  </Space>
                </div>
                ),
              };
            })}
          />
        </Card>
      ) : null}
      <Modal
        title="场景迷宫提示词"
        open={scenePromptOpen}
        footer={null}
        width={760}
        onCancel={() => setScenePromptOpen(false)}
      >
        <Typography.Paragraph
          copyable={{
            text: SCENE_MAZE_PROMPT,
            tooltips: ["复制提示词", "已复制"],
          }}
        >
          点击右侧复制图标复制完整提示词。
        </Typography.Paragraph>
        <pre
          style={{
            maxHeight: 520,
            overflow: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: "#f7f7f7",
            border: "1px solid #eeeeee",
            borderRadius: 6,
            padding: 16,
            margin: 0,
          }}
        >
          {SCENE_MAZE_PROMPT}
        </pre>
      </Modal>
    </>
  );
}
