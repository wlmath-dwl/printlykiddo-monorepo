"use client";

import { Button, Card, Form, InputNumber, Progress, Select, Space, Tabs, Typography, message } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";

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

export type SudokuKind = "4x4" | "6x6" | "9x9";
type Difficulty = "easy" | "medium" | "hard";

type SudokuConfig = {
  kind: SudokuKind;
  title: string;
  slug: string;
  size: number;
  boxRows: number;
  boxCols: number;
  allowedDifficulties: Difficulty[];
};

type Puzzle = {
  puzzle: number[][];
  solution: number[][];
};

type FormValues = {
  kind: SudokuKind;
  difficulty: Difficulty;
  count: number;
  includeAnswers: boolean;
};

const TILE_SIZE = 1600;

const SUDOKU_CONFIGS: Record<SudokuKind, SudokuConfig> = {
  "4x4": {
    kind: "4x4",
    title: "4x4 Sudoku",
    slug: "4x4-sudoku",
    size: 4,
    boxRows: 2,
    boxCols: 2,
    allowedDifficulties: ["easy"],
  },
  "6x6": {
    kind: "6x6",
    title: "6x6 Sudoku",
    slug: "6x6-sudoku",
    size: 6,
    boxRows: 2,
    boxCols: 3,
    allowedDifficulties: ["easy", "medium"],
  },
  "9x9": {
    kind: "9x9",
    title: "9x9 Sudoku",
    slug: "9x9-sudoku",
    size: 9,
    boxRows: 3,
    boxCols: 3,
    allowedDifficulties: ["easy", "medium", "hard"],
  },
};

const KIND_OPTIONS = [
  { label: "4x4 Sudoku", value: "4x4" },
  { label: "6x6 Sudoku", value: "6x6" },
  { label: "9x9 Sudoku", value: "9x9" },
];

const DIFFICULTY_OPTIONS: Array<{ label: string; value: Difficulty }> = [
  { label: "Easy", value: "easy" },
  { label: "Medium", value: "medium" },
  { label: "Hard", value: "hard" },
];

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function cloneGrid(grid: number[][]) {
  return grid.map((row) => [...row]);
}

function pattern(row: number, col: number, config: SudokuConfig) {
  return (
    (config.boxCols * (row % config.boxRows) +
      Math.floor(row / config.boxRows) +
      col) %
    config.size
  );
}

function shuffledBands(config: SudokuConfig, groupSize: number) {
  const groups = shuffle(
    Array.from({ length: config.size / groupSize }, (_, index) => index),
  );
  return groups.flatMap((group) =>
    shuffle(Array.from({ length: groupSize }, (_, index) => group * groupSize + index)),
  );
}

function generateSolution(config: SudokuConfig) {
  const symbols = shuffle(Array.from({ length: config.size }, (_, index) => index + 1));
  const rows = shuffledBands(config, config.boxRows);
  const cols = shuffledBands(config, config.boxCols);

  return rows.map((row) =>
    cols.map((col) => symbols[pattern(row, col, config)] ?? 1),
  );
}

function getRemovalTarget(config: SudokuConfig, difficulty: Difficulty) {
  const total = config.size * config.size;
  return Math.max(0, total - getGivenTarget(config, difficulty));
}

function getGivenTarget(config: SudokuConfig, difficulty: Difficulty) {
  // 提示数量不再用统一百分比，而是按 尺寸×难度 显式配置。
  // 难度真正由“解题所需技巧”决定（见 getTechniqueBand / analyzePuzzle），
  // 这里的提示数只是挖空目标，用来控制空格密度与生成稳定性。
  const givensByKind: Record<SudokuKind, Partial<Record<Difficulty, number>>> = {
    // 4x4：幼儿园，纯填空即可解。
    "4x4": { easy: 8 },
    // 6x6：小学低中年级，easy/medium 靠“扫描量 + 空格密度”区分，技巧都封顶到隐性唯一数。
    "6x6": { easy: 18, medium: 14 },
    // 9x9：小学中高年级，用技巧升级区分：easy=唯一数、medium=必须扫描、hard=区块/数对。
    "9x9": { easy: 36, medium: 32, hard: 30 },
  };

  const configured = givensByKind[config.kind]?.[difficulty];
  if (typeof configured === "number") {
    return configured;
  }
  return Math.ceil(config.size * config.size * 0.5);
}

type NaturalRules = {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
  minBox: number;
  maxBox: number;
  minDigit: number;
  maxDigit: number;
};

function getNaturalRules(config: SudokuConfig, difficulty: Difficulty): NaturalRules {
  if (config.size === 4) {
    return {
      minRow: 2,
      maxRow: 2,
      minCol: 2,
      maxCol: 2,
      minBox: 2,
      maxBox: 2,
      minDigit: 1,
      maxDigit: 3,
    };
  }

  if (config.size === 6) {
    // easy 18 提示（均值 3/单元）、medium 14 提示（均值 ~2.3/单元）。
    return difficulty === "medium"
      ? {
          minRow: 1,
          maxRow: 4,
          minCol: 1,
          maxCol: 4,
          minBox: 1,
          maxBox: 4,
          minDigit: 1,
          maxDigit: 4,
        }
      : {
          minRow: 2,
          maxRow: 4,
          minCol: 2,
          maxCol: 4,
          minBox: 2,
          maxBox: 4,
          minDigit: 2,
          maxDigit: 4,
        };
  }

  // 9x9：easy 38 / medium 34 / hard 30 提示。
  if (difficulty === "hard") {
    return {
      minRow: 2,
      maxRow: 5,
      minCol: 2,
      maxCol: 5,
      minBox: 2,
      maxBox: 5,
      minDigit: 2,
      maxDigit: 5,
    };
  }

  return difficulty === "medium"
    ? {
        minRow: 2,
        maxRow: 6,
        minCol: 2,
        maxCol: 6,
        minBox: 2,
        maxBox: 6,
        minDigit: 2,
        maxDigit: 6,
      }
    : {
        minRow: 3,
        maxRow: 6,
        minCol: 3,
        maxCol: 6,
        minBox: 3,
        maxBox: 6,
        minDigit: 2,
        maxDigit: 6,
      };
}

function getBoxIndex(config: SudokuConfig, row: number, col: number) {
  const boxRow = Math.floor(row / config.boxRows);
  const boxCol = Math.floor(col / config.boxCols);
  return boxRow * (config.size / config.boxCols) + boxCol;
}

function countPuzzleGivens(grid: number[][], config: SudokuConfig) {
  const rows = Array.from({ length: config.size }, () => 0);
  const cols = Array.from({ length: config.size }, () => 0);
  const boxes = Array.from({ length: config.size }, () => 0);
  const digits = Array.from({ length: config.size + 1 }, () => 0);
  let total = 0;

  for (let row = 0; row < config.size; row += 1) {
    for (let col = 0; col < config.size; col += 1) {
      const value = grid[row][col];
      if (!value) {
        continue;
      }
      total += 1;
      rows[row] += 1;
      cols[col] += 1;
      boxes[getBoxIndex(config, row, col)] += 1;
      digits[value] += 1;
    }
  }

  return { total, rows, cols, boxes, digits: digits.slice(1) };
}

function isWithinRange(values: number[], min: number, max: number) {
  return values.every((value) => value >= min && value <= max);
}

function isNaturalPuzzle(grid: number[][], config: SudokuConfig, difficulty: Difficulty) {
  const target = getGivenTarget(config, difficulty);
  const counts = countPuzzleGivens(grid, config);
  const rules = getNaturalRules(config, difficulty);

  return (
    counts.total === target &&
    isWithinRange(counts.rows, rules.minRow, rules.maxRow) &&
    isWithinRange(counts.cols, rules.minCol, rules.maxCol) &&
    isWithinRange(counts.boxes, rules.minBox, rules.maxBox) &&
    isWithinRange(counts.digits, rules.minDigit, rules.maxDigit)
  );
}

function canRemoveGiven(
  grid: number[][],
  config: SudokuConfig,
  difficulty: Difficulty,
  row: number,
  col: number,
) {
  const value = grid[row][col];
  if (!value) {
    return false;
  }

  const rules = getNaturalRules(config, difficulty);
  const counts = countPuzzleGivens(grid, config);
  const boxIndex = getBoxIndex(config, row, col);

  return (
    counts.rows[row] > rules.minRow &&
    counts.cols[col] > rules.minCol &&
    counts.boxes[boxIndex] > rules.minBox &&
    counts.digits[value - 1] > rules.minDigit
  );
}

function isValidCandidate(grid: number[][], config: SudokuConfig, row: number, col: number, value: number) {
  for (let index = 0; index < config.size; index += 1) {
    if (grid[row][index] === value || grid[index][col] === value) {
      return false;
    }
  }

  const boxStartRow = Math.floor(row / config.boxRows) * config.boxRows;
  const boxStartCol = Math.floor(col / config.boxCols) * config.boxCols;
  for (let r = 0; r < config.boxRows; r += 1) {
    for (let c = 0; c < config.boxCols; c += 1) {
      if (grid[boxStartRow + r][boxStartCol + c] === value) {
        return false;
      }
    }
  }

  return true;
}

function countSolutions(grid: number[][], config: SudokuConfig, limit = 2) {
  const working = cloneGrid(grid);
  let count = 0;

  function solve() {
    if (count >= limit) {
      return;
    }

    let bestRow = -1;
    let bestCol = -1;
    let bestCandidates: number[] = [];

    for (let row = 0; row < config.size; row += 1) {
      for (let col = 0; col < config.size; col += 1) {
        if (working[row][col] !== 0) {
          continue;
        }
        const candidates = [];
        for (let value = 1; value <= config.size; value += 1) {
          if (isValidCandidate(working, config, row, col, value)) {
            candidates.push(value);
          }
        }
        if (candidates.length === 0) {
          return;
        }
        if (bestRow === -1 || candidates.length < bestCandidates.length) {
          bestRow = row;
          bestCol = col;
          bestCandidates = candidates;
        }
      }
    }

    if (bestRow === -1) {
      count += 1;
      return;
    }

    for (const value of bestCandidates) {
      working[bestRow][bestCol] = value;
      solve();
      working[bestRow][bestCol] = 0;
      if (count >= limit) {
        return;
      }
    }
  }

  solve();
  return count;
}

// 解题技巧分层（数值越大越难）。给孩子的题目最高只用到“数对”，绝不涉及 X-Wing、链等。
const TIER = {
  NONE: 0,
  NAKED_SINGLE: 1, // 显性唯一数：某格只剩一个候选数（被动填空）
  HIDDEN_SINGLE: 2, // 隐性唯一数：某单元内某数字只能进一个格（扫描找位）
  LOCKED: 3, // 区块 / pointing-claiming：候选数排除
  PAIR: 4, // 数对（显性/隐性）：候选数排除
} as const;

type TechniqueBand = { floor: number; ceiling: number };

// 每个 尺寸×难度 允许的技巧区间：floor=至少要用到，ceiling=最多允许用到。
// 超过 ceiling（或需要猜测）判为过难；低于 floor 判为过简单。
// 说明：数独里真正“必须用到”区块/数对的题，用随机挖空极难碰到（绝大多数题
// 无论空多少都能靠唯一数/隐性唯一数解完）。因此难度阶梯的可靠杠杆是：
//   1) 是否必须“扫描找位”(隐性唯一数) —— 区分 easy 与 medium；
//   2) 空格密度 —— 越空越费时；
//   3) 区块/数对 —— 仅用于 9x9 hard，作为封顶技巧。
function getTechniqueBand(config: SudokuConfig, difficulty: Difficulty): TechniqueBand {
  if (config.size === 4) {
    // 幼儿园：填空即可，允许扫描但不强制。
    return { floor: TIER.NONE, ceiling: TIER.HIDDEN_SINGLE };
  }

  if (config.size === 6) {
    // easy：允许纯填空（显性唯一数）即可解，空更少。
    // medium：必须用到扫描找位（隐性唯一数），且空更多。
    return difficulty === "medium"
      ? { floor: TIER.HIDDEN_SINGLE, ceiling: TIER.HIDDEN_SINGLE }
      : { floor: TIER.NAKED_SINGLE, ceiling: TIER.HIDDEN_SINGLE };
  }

  // 9x9
  if (difficulty === "easy") {
    // 唯一数为主，最多用到扫描找位。
    return { floor: TIER.NAKED_SINGLE, ceiling: TIER.HIDDEN_SINGLE };
  }
  if (difficulty === "medium") {
    // 必须扫描找位；允许（但不强制）用到区块排除。
    return { floor: TIER.HIDDEN_SINGLE, ceiling: TIER.LOCKED };
  }
  // hard：必须用到区块排除；允许（但不强制）用到数对；封顶到数对。
  return { floor: TIER.LOCKED, ceiling: TIER.PAIR };
}

type Cell = [number, number];

type SudokuUnits = {
  rows: Cell[][];
  cols: Cell[][];
  boxes: Cell[][];
  all: Cell[][];
};

function buildUnits(config: SudokuConfig): SudokuUnits {
  const size = config.size;
  const rows: Cell[][] = [];
  const cols: Cell[][] = [];
  const boxes: Cell[][] = [];

  for (let r = 0; r < size; r += 1) {
    rows.push(Array.from({ length: size }, (_, c) => [r, c] as Cell));
  }
  for (let c = 0; c < size; c += 1) {
    cols.push(Array.from({ length: size }, (_, r) => [r, c] as Cell));
  }

  const boxRowsCount = size / config.boxRows;
  const boxColsCount = size / config.boxCols;
  // 与 getBoxIndex 的编号顺序保持一致（boxRow 为主序）。
  for (let boxRow = 0; boxRow < boxRowsCount; boxRow += 1) {
    for (let boxCol = 0; boxCol < boxColsCount; boxCol += 1) {
      const cells: Cell[] = [];
      for (let dr = 0; dr < config.boxRows; dr += 1) {
        for (let dc = 0; dc < config.boxCols; dc += 1) {
          cells.push([boxRow * config.boxRows + dr, boxCol * config.boxCols + dc]);
        }
      }
      boxes.push(cells);
    }
  }

  return { rows, cols, boxes, all: [...rows, ...cols, ...boxes] };
}

function setsEqual(a: Set<number>, b: Set<number>) {
  if (a.size !== b.size) {
    return false;
  }
  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }
  return true;
}

function sameCellSet(a: Cell[], b: Cell[]) {
  if (a.length !== b.length) {
    return false;
  }
  const key = ([r, c]: Cell) => `${r},${c}`;
  const setA = new Set(a.map(key));
  return b.every((cell) => setA.has(key(cell)));
}

// 用“拟人技巧”尝试解题，返回是否解出以及用到的最高技巧层级。
// 始终从最简单的技巧开始尝试，因此 hardest 即为“解这道题真正需要的最高技巧”。
function analyzePuzzle(startGrid: number[][], config: SudokuConfig): {
  solved: boolean;
  hardest: number;
} {
  const size = config.size;
  const grid = cloneGrid(startGrid);
  const candidates: Set<number>[][] = grid.map((row) => row.map(() => new Set<number>()));
  const units = buildUnits(config);

  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (grid[r][c] !== 0) {
        continue;
      }
      for (let value = 1; value <= size; value += 1) {
        if (isValidCandidate(grid, config, r, c, value)) {
          candidates[r][c].add(value);
        }
      }
    }
  }

  let hardest = TIER.NONE as number;

  function place(row: number, col: number, value: number) {
    grid[row][col] = value;
    candidates[row][col] = new Set();
    for (let index = 0; index < size; index += 1) {
      candidates[row][index].delete(value);
      candidates[index][col].delete(value);
    }
    const boxStartRow = Math.floor(row / config.boxRows) * config.boxRows;
    const boxStartCol = Math.floor(col / config.boxCols) * config.boxCols;
    for (let dr = 0; dr < config.boxRows; dr += 1) {
      for (let dc = 0; dc < config.boxCols; dc += 1) {
        candidates[boxStartRow + dr][boxStartCol + dc].delete(value);
      }
    }
  }

  function emptyCells(unit: Cell[]) {
    return unit.filter(([r, c]) => grid[r][c] === 0);
  }

  function nakedSingle() {
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (grid[r][c] === 0 && candidates[r][c].size === 1) {
          place(r, c, [...candidates[r][c]][0]);
          return true;
        }
      }
    }
    return false;
  }

  function hiddenSingle() {
    for (const unit of units.all) {
      const cells = emptyCells(unit);
      for (let value = 1; value <= size; value += 1) {
        const spots = cells.filter(([r, c]) => candidates[r][c].has(value));
        if (spots.length === 1) {
          place(spots[0][0], spots[0][1], value);
          return true;
        }
      }
    }
    return false;
  }

  function lockedCandidates() {
    let changed = false;

    // Pointing：某宫内某数字的候选都在同一行/列 → 从该行/列宫外格清除。
    for (const box of units.boxes) {
      const boxRowSet = new Set(box.map(([r]) => r));
      const boxColSet = new Set(box.map(([, c]) => c));
      for (let value = 1; value <= size; value += 1) {
        const spots = box.filter(([r, c]) => grid[r][c] === 0 && candidates[r][c].has(value));
        if (spots.length < 2) {
          continue;
        }
        const rowSet = new Set(spots.map(([r]) => r));
        const colSet = new Set(spots.map(([, c]) => c));
        if (rowSet.size === 1) {
          const row = spots[0][0];
          for (let c = 0; c < size; c += 1) {
            if (!boxColSet.has(c) && grid[row][c] === 0 && candidates[row][c].delete(value)) {
              changed = true;
            }
          }
        }
        if (colSet.size === 1) {
          const col = spots[0][1];
          for (let r = 0; r < size; r += 1) {
            if (!boxRowSet.has(r) && grid[r][col] === 0 && candidates[r][col].delete(value)) {
              changed = true;
            }
          }
        }
      }
    }
    if (changed) {
      return true;
    }

    // Claiming：某行/列内某数字的候选都在同一宫 → 从该宫其余格清除。
    const claimLine = (line: Cell[]) => {
      for (let value = 1; value <= size; value += 1) {
        const spots = line.filter(([r, c]) => grid[r][c] === 0 && candidates[r][c].has(value));
        if (spots.length < 2) {
          continue;
        }
        const boxIndexes = new Set(spots.map(([r, c]) => getBoxIndex(config, r, c)));
        if (boxIndexes.size !== 1) {
          continue;
        }
        const boxIndex = [...boxIndexes][0];
        const lineKeys = new Set(spots.map(([r, c]) => `${r},${c}`));
        for (const [r, c] of units.boxes[boxIndex]) {
          if (lineKeys.has(`${r},${c}`)) {
            continue;
          }
          if (grid[r][c] === 0 && candidates[r][c].delete(value)) {
            changed = true;
          }
        }
      }
    };
    for (const row of units.rows) {
      claimLine(row);
    }
    for (const col of units.cols) {
      claimLine(col);
    }

    return changed;
  }

  function pairs() {
    let changed = false;

    for (const unit of units.all) {
      const cells = emptyCells(unit);

      // 显性数对：两个格候选完全相同且都恰为 2 个 → 从同单元其它格清除这两个数。
      for (let i = 0; i < cells.length; i += 1) {
        const [r1, c1] = cells[i];
        if (candidates[r1][c1].size !== 2) {
          continue;
        }
        for (let j = i + 1; j < cells.length; j += 1) {
          const [r2, c2] = cells[j];
          if (candidates[r2][c2].size !== 2) {
            continue;
          }
          if (!setsEqual(candidates[r1][c1], candidates[r2][c2])) {
            continue;
          }
          const pair = [...candidates[r1][c1]];
          for (const [r, c] of cells) {
            if ((r === r1 && c === c1) || (r === r2 && c === c2)) {
              continue;
            }
            for (const value of pair) {
              if (candidates[r][c].delete(value)) {
                changed = true;
              }
            }
          }
        }
      }
      if (changed) {
        return true;
      }

      // 隐性数对：两个数字在该单元内只出现在同两个格 → 这两个格只保留这两个数。
      const spotsByValue = new Map<number, Cell[]>();
      for (let value = 1; value <= size; value += 1) {
        const spots = cells.filter(([r, c]) => candidates[r][c].has(value));
        if (spots.length > 0) {
          spotsByValue.set(value, spots);
        }
      }
      const values = [...spotsByValue.keys()];
      for (let i = 0; i < values.length; i += 1) {
        for (let j = i + 1; j < values.length; j += 1) {
          const v1 = values[i];
          const v2 = values[j];
          const s1 = spotsByValue.get(v1)!;
          const s2 = spotsByValue.get(v2)!;
          if (s1.length === 2 && s2.length === 2 && sameCellSet(s1, s2)) {
            for (const [r, c] of s1) {
              for (const value of [...candidates[r][c]]) {
                if (value !== v1 && value !== v2 && candidates[r][c].delete(value)) {
                  changed = true;
                }
              }
            }
          }
        }
      }
      if (changed) {
        return true;
      }
    }

    return changed;
  }

  while (true) {
    let done = true;
    for (let r = 0; r < size && done; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (grid[r][c] === 0) {
          done = false;
          break;
        }
      }
    }
    if (done) {
      return { solved: true, hardest };
    }

    if (nakedSingle()) {
      hardest = Math.max(hardest, TIER.NAKED_SINGLE);
      continue;
    }
    if (hiddenSingle()) {
      hardest = Math.max(hardest, TIER.HIDDEN_SINGLE);
      continue;
    }
    if (lockedCandidates()) {
      hardest = Math.max(hardest, TIER.LOCKED);
      continue;
    }
    if (pairs()) {
      hardest = Math.max(hardest, TIER.PAIR);
      continue;
    }

    // 卡住：需要更高级技巧或猜测 → 对孩子而言过难。
    return { solved: false, hardest };
  }
}

function generatePuzzle(config: SudokuConfig, difficulty: Difficulty): Puzzle {
  const band = getTechniqueBand(config, difficulty);

  // 9x9 hard 需要“必须用到区块/数对”的题，命中率较低，需要更多尝试；其余难度很快就命中。
  const maxAttempts = config.size === 9 && difficulty === "hard" ? 1500 : 600;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const solution = generateSolution(config);
    const puzzle = cloneGrid(solution);
    const cells = shuffle(
      Array.from({ length: config.size * config.size }, (_, index) => ({
        row: Math.floor(index / config.size),
        col: index % config.size,
      })),
    );

    let removed = 0;
    const removalTarget = getRemovalTarget(config, difficulty);
    for (const cell of cells) {
      if (removed >= removalTarget) {
        break;
      }
      if (!canRemoveGiven(puzzle, config, difficulty, cell.row, cell.col)) {
        continue;
      }
      const previous = puzzle[cell.row][cell.col];
      puzzle[cell.row][cell.col] = 0;
      if (countSolutions(puzzle, config, 2) !== 1) {
        puzzle[cell.row][cell.col] = previous;
      } else {
        removed += 1;
      }
    }

    if (
      removed === removalTarget &&
      isNaturalPuzzle(puzzle, config, difficulty) &&
      countSolutions(puzzle, config, 2) === 1
    ) {
      // 用拟人技巧定级：必须能纯逻辑解出（不用猜），且所需最高技巧落在该难度区间内。
      const grade = analyzePuzzle(puzzle, config);
      if (grade.solved && grade.hardest >= band.floor && grade.hardest <= band.ceiling) {
        return { puzzle, solution };
      }
    }
  }

  throw new Error(`无法生成符合质量规则的 ${config.title} ${difficulty} 题目，请减少生成数量后重试。`);
}

function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: {
    size: number;
    weight?: string;
    align?: CanvasTextAlign;
    color?: string;
  },
) {
  ctx.fillStyle = options.color ?? "#222222";
  ctx.textAlign = options.align ?? "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `${options.weight ?? "400"} ${options.size}px Arial, Helvetica, sans-serif`;
  ctx.fillText(text, x, y);
}

function drawLine(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, width: number) {
  ctx.lineWidth = width;
  ctx.strokeStyle = "#222222";
  ctx.lineCap = "square";
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  grid: number[][],
  config: SudokuConfig,
  x: number,
  y: number,
  cellSize: number,
) {
  const gridSize = config.size * cellSize;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, gridSize, gridSize);

  for (let index = 0; index <= config.size; index += 1) {
    const isBoxLine = index % config.boxCols === 0;
    drawLine(ctx, x + index * cellSize, y, x + index * cellSize, y + gridSize, isBoxLine ? 8 : 3);
  }
  for (let index = 0; index <= config.size; index += 1) {
    const isBoxLine = index % config.boxRows === 0;
    drawLine(ctx, x, y + index * cellSize, x + gridSize, y + index * cellSize, isBoxLine ? 8 : 3);
  }

  for (let row = 0; row < config.size; row += 1) {
    for (let col = 0; col < config.size; col += 1) {
      const value = grid[row][col];
      if (!value) {
        continue;
      }
      drawText(
        ctx,
        String(value),
        x + col * cellSize + cellSize / 2,
        y + row * cellSize + cellSize / 2 + cellSize * 0.18,
        {
          size: Math.round(cellSize * 0.42),
          weight: "600",
          align: "center",
          color: "#202020",
        },
      );
    }
  }
}

function getSinglePuzzleCellSize(config: SudokuConfig) {
  if (config.size === 4) {
    return 380;
  }
  if (config.size === 6) {
    return 250;
  }
  return 165;
}

function renderPuzzleImage(options: {
  config: SudokuConfig;
  puzzle: Puzzle;
  answerKey: boolean;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("无法创建画布。");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

  const cellSize = getSinglePuzzleCellSize(options.config);
  const gridSize = options.config.size * cellSize;
  const gridX = (TILE_SIZE - gridSize) / 2;
  const gridY = Math.round((TILE_SIZE - gridSize) / 2);
  drawGrid(
    ctx,
    options.answerKey ? options.puzzle.solution : options.puzzle.puzzle,
    options.config,
    gridX,
    gridY,
    cellSize,
  );

  return canvas;
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

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type ZipEntry = {
  name: string;
  data: Uint8Array;
};

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pushUint16(parts: number[], value: number) {
  parts.push(value & 0xff, (value >>> 8) & 0xff);
}

function pushUint32(parts: number[], value: number) {
  parts.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function dosDateTime(date = new Date()) {
  const dosTime =
    (date.getHours() << 11) |
    (date.getMinutes() << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    ((date.getFullYear() - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate();
  return { dosDate, dosTime };
}

function createZip(entries: ZipEntry[]) {
  const encoder = new TextEncoder();
  const fileParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const { dosDate, dosTime } = dosDateTime();

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const localHeader: number[] = [];
    pushUint32(localHeader, 0x04034b50);
    pushUint16(localHeader, 20);
    pushUint16(localHeader, 0);
    pushUint16(localHeader, 0);
    pushUint16(localHeader, dosTime);
    pushUint16(localHeader, dosDate);
    pushUint32(localHeader, crc);
    pushUint32(localHeader, entry.data.length);
    pushUint32(localHeader, entry.data.length);
    pushUint16(localHeader, nameBytes.length);
    pushUint16(localHeader, 0);
    const localHeaderBytes = new Uint8Array(localHeader);
    fileParts.push(localHeaderBytes, nameBytes, entry.data);

    const centralHeader: number[] = [];
    pushUint32(centralHeader, 0x02014b50);
    pushUint16(centralHeader, 20);
    pushUint16(centralHeader, 20);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, dosTime);
    pushUint16(centralHeader, dosDate);
    pushUint32(centralHeader, crc);
    pushUint32(centralHeader, entry.data.length);
    pushUint32(centralHeader, entry.data.length);
    pushUint16(centralHeader, nameBytes.length);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint16(centralHeader, 0);
    pushUint32(centralHeader, 0);
    pushUint32(centralHeader, offset);
    centralParts.push(new Uint8Array(centralHeader), nameBytes);

    offset += localHeaderBytes.length + nameBytes.length + entry.data.length;
  }

  const centralSize = centralParts.reduce((sum, item) => sum + item.length, 0);
  const endHeader: number[] = [];
  pushUint32(endHeader, 0x06054b50);
  pushUint16(endHeader, 0);
  pushUint16(endHeader, 0);
  pushUint16(endHeader, entries.length);
  pushUint16(endHeader, entries.length);
  pushUint32(endHeader, centralSize);
  pushUint32(endHeader, offset);
  pushUint16(endHeader, 0);

  const blobParts = [...fileParts, ...centralParts, new Uint8Array(endHeader)].map(
    (part) =>
      part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength) as ArrayBuffer,
  );

  return new Blob(blobParts, {
    type: "application/zip",
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

export function SudokuGeneratorPage({
  fixedKind,
  managedPageSlug,
  managedCategory,
}: {
  fixedKind?: SudokuKind;
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
  const [managedPage, setManagedPage] = useState<ManagedPuzzlePage | null>(null);
  const [previews, setPreviews] = useState<Partial<Record<Difficulty, { puzzle: string; answer: string }>>>({});
  const watchedKind = Form.useWatch("kind", form) ?? "4x4";
  const selectedKind = fixedKind ?? watchedKind;
  const config = SUDOKU_CONFIGS[selectedKind];
  const difficultyOptions = useMemo(
    () => DIFFICULTY_OPTIONS.filter((item) => config.allowedDifficulties.includes(item.value)),
    [config.allowedDifficulties],
  );

  useEffect(() => {
    if (!managedPageSlug) return;
    getPuzzlePublishState<ManagedPuzzlePage>(managedPageSlug)
      .then((page) => {
        setManagedPage(page);
        setPublishJob(page.publish_job);
        if (page.publish_job && page.publish_job.status !== "completed") {
          const completed = page.publish_job.difficulty_index * 48 + page.publish_job.item_index;
          const total = config.allowedDifficulties.length * 48;
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

  function handlePreview(difficulty: Difficulty) {
    try {
      const puzzle = generatePuzzle(config, difficulty);
      setPreviews((current) => ({
        ...current,
        [difficulty]: {
          puzzle: renderPuzzleImage({ config, puzzle, answerKey: false }).toDataURL("image/png"),
          answer: renderPuzzleImage({ config, puzzle, answerKey: true }).toDataURL("image/png"),
        },
      }));
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "生成预览失败。");
    }
  }

  async function buildBatch(values: FormValues, onGenerated?: (current: number, total: number) => void) {
    const currentConfig = SUDOKU_CONFIGS[values.kind];
    const count = Math.max(1, Math.min(300, Number(values.count ?? 1)));
    const entries: ZipEntry[] = [];
    const publishForm = managedPageSlug ? new FormData() : null;
    publishForm?.set("difficulty", values.difficulty);
    for (let index = 1; index <= count; index += 1) {
      const puzzle = generatePuzzle(currentConfig, values.difficulty);
      const baseFileName = `${currentConfig.slug}-${values.difficulty}-${String(index).padStart(3, "0")}.png`;
      const puzzleBlob = await canvasToBlob(renderPuzzleImage({ config: currentConfig, puzzle, answerKey: false }));
      entries.push({ name: `puzzles/${baseFileName}`, data: new Uint8Array(await puzzleBlob.arrayBuffer()) });
      publishForm?.append("puzzles", puzzleBlob, baseFileName);
      if (values.includeAnswers) {
        const answerBlob = await canvasToBlob(renderPuzzleImage({ config: currentConfig, puzzle, answerKey: true }));
        entries.push({ name: `answers/${baseFileName}`, data: new Uint8Array(await answerBlob.arrayBuffer()) });
        publishForm?.append("answers", answerBlob, baseFileName);
      }
      if (index % 10 === 0) await new Promise((resolve) => window.setTimeout(resolve, 0));
      onGenerated?.(index, count);
    }
    return { currentConfig, count, entries, publishForm };
  }

  async function runResumablePublish(initialJob?: PuzzlePublishJob) {
    if (!fixedKind || !managedPageSlug) return;
    if (processingRef.current) return;
    processingRef.current = true;
    pauseRequestedRef.current = false;
    setGenerating(true);
    try {
      const countPerDifficulty = 48;
      const difficultyCount = config.allowedDifficulties.length;
      const totalItems = difficultyCount * countPerDifficulty;
      let job = initialJob ?? (await startOrResumePuzzlePublish(managedPageSlug)).publish_job;
      setPublishJob(job);
      while (mountedRef.current && !pauseRequestedRef.current && job.status === "running" && job.difficulty_index < difficultyCount) {
        const difficulty = config.allowedDifficulties[job.difficulty_index];
        const difficultyLabel = difficulty[0].toUpperCase() + difficulty.slice(1);
        if (job.item_index < countPerDifficulty) {
          const index = job.item_index;
          setGenerationProgress({
            percent: Math.round(((job.difficulty_index * countPerDifficulty + index) / totalItems) * 100),
            label: `正在生成并上传 ${difficultyLabel}：${index}/${countPerDifficulty}（题目 ${index}，答案 ${index}）`,
          });
          const puzzle = generatePuzzle(config, difficulty);
          const puzzleBlob = await canvasToBlob(renderPuzzleImage({ config, puzzle, answerKey: false }));
          const answerBlob = await canvasToBlob(renderPuzzleImage({ config, puzzle, answerKey: true }));
          const fileName = `${config.slug}-${difficulty}-${String(index + 1).padStart(3, "0")}.png`;
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
        messageApi.success(`已生成并发布全部 ${difficultyCount} 个难度，共 ${difficultyCount * 48} 张题目和配套答案。`);
      } else if (pauseRequestedRef.current || job.status === "paused") {
        setGenerationProgress((current) => ({ percent: current?.percent ?? 0, label: "已暂停，点击继续可从当前进度接着处理" }));
      }
    } catch (error) {
      if (!pauseRequestedRef.current) setGenerationProgress((current) => ({ percent: current?.percent ?? 0, label: "任务中断，点击继续将从已上传进度恢复" }));
      if (!pauseRequestedRef.current) messageApi.error(error instanceof Error ? error.message : "生成全部数独失败。");
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
      const zip = createZip(entries);
      downloadBlob(
        zip,
        `${currentConfig.slug}-${values.difficulty}-${count}-puzzles${values.includeAnswers ? "-with-answers" : ""}.zip`,
      );
      messageApi.success(`已生成 ${count} 张 ${currentConfig.title} 单题图，并打包为 zip。`);
    } catch (error) {
      messageApi.error(error instanceof Error ? error.message : "生成数独图片失败。");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      {contextHolder}
      <Card
        title="数独生成器"
        extra={managedCategory ? <Space wrap><PuzzleActiveSwitch category={managedCategory} /><PuzzleCoverEditorButton category={managedCategory} label="编辑页面封面" /></Space> : null}
        variant="borderless"
      >
        <Typography.Paragraph type="secondary">
          {managedPageSlug
            ? "固定 Sudoku 页面编辑器。按难度预览，生成后写入本地专用数据表并将题目图和答案图同步到线上图床。"
            : "按当前 Sudoku 分类生成黑白低墨量单题图片。题目由程序生成并校验唯一解，输出为一个 zip；不会写入图片库。"}
        </Typography.Paragraph>

        {managedPageSlug ? (
          <div>
            <Typography.Paragraph>
              固定生成：{config.allowedDifficulties.map((item) => item[0].toUpperCase() + item.slice(1)).join(" / ")}，每个难度 48 张题目，并生成对应答案图。
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
            kind: fixedKind ?? "4x4",
            difficulty: "easy",
            count: managedPageSlug ? 48 : 1,
            includeAnswers: true,
          }}
          onValuesChange={(changed) => {
            if ("kind" in changed) {
              const nextConfig = SUDOKU_CONFIGS[changed.kind as SudokuKind];
              form.setFieldValue("difficulty", nextConfig.allowedDifficulties[0]);
            }
          }}
          onFinish={(values) => void handleGenerate(values)}
          style={{ maxWidth: 720 }}
        >
          {fixedKind ? null : (
            <Form.Item label="分类" name="kind" rules={[{ required: true }]}>
              <Select options={KIND_OPTIONS} />
            </Form.Item>
          )}

          <Form.Item label="难度" name="difficulty" rules={[{ required: true }]}>
            <Select options={difficultyOptions} />
          </Form.Item>

          <Form.Item
            label="生成图片数量"
            name="count"
            rules={[{ required: true, message: "请输入生成数量" }]}
            extra="表示生成多少张单独的数独题目图。答案图如果开启，会作为配套图片一起放入 zip。"
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
            <Typography.Text type="secondary">
              当前版式：{config.title}，每张图片 1 个数独。
            </Typography.Text>
          </Space>
        </Form>
        )}
      </Card>
      {managedPageSlug ? (
        <Card title="难度预览与已发布图片" variant="borderless" style={{ marginTop: 16 }}>
          <Tabs
            items={config.allowedDifficulties.map((difficulty) => {
              const preview = previews[difficulty];
              const difficultyLabel = difficulty[0].toUpperCase() + difficulty.slice(1);
              const publishedAssets = (managedPage?.assets ?? []).filter(
                (asset) => asset.asset_kind === "puzzle" && asset.difficulty === difficulty,
              );
              return {
                key: difficulty,
                label: `${difficultyLabel} (${publishedAssets.length})`,
                children: (
                <div>
                  <Button onClick={() => handlePreview(difficulty)}>生成一组 {difficultyLabel} 预览</Button>
                  {preview ? (
                    <Space align="start" wrap style={{ marginTop: 12 }}>
                      <img src={preview.puzzle} alt={`${difficulty} 数独题目预览`} style={{ width: 280, maxWidth: "100%", border: "1px solid #eee" }} />
                      <img src={preview.answer} alt={`${difficulty} 数独答案预览`} style={{ width: 280, maxWidth: "100%", border: "1px solid #eee" }} />
                    </Space>
                  ) : null}
                  <Typography.Title level={5} style={{ marginTop: 24 }}>已发布 {difficultyLabel} 图片</Typography.Title>
                  <Space align="start" wrap>
                    {publishedAssets.map((asset) => {
                      const query = new URLSearchParams({ path: asset.image_url, local_file_path: asset.local_file_path });
                      return <img key={asset.id} src={`/api/admin/imgs/preview?${query}`} alt={`${asset.difficulty} 数独`} style={{ width: 180, border: "1px solid #eee" }} />;
                    })}
                  </Space>
                </div>
                ),
              };
            })}
          />
        </Card>
      ) : null}
    </>
  );
}
