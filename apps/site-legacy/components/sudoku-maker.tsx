"use client";

import { useMemo, useState } from "react";

type SudokuSize = 3 | 4 | 6 | 9;
type SudokuMode = "number" | "shape" | "classic";
type Difficulty = "mini" | "practice" | "challenge" | "easy" | "medium" | "hard";
type PageLayout = 1 | 2 | 4;
type PaperSize = "letter" | "a4";
type Puzzle = { puzzle: number[]; solution: number[] };

const sizeOptions: Array<{ size: SudokuSize; label: string }> = [
  { size: 3, label: "3×3 Mini" },
  { size: 4, label: "4×4 Kids" },
  { size: 6, label: "6×6" },
  { size: 9, label: "9×9 Classic" },
];

const difficultyOptions: Record<SudokuSize, Array<{ value: Difficulty; label: string; description: string }>> = {
  3: [{ value: "mini", label: "Mini Sudoku", description: "A gentle start" }],
  4: [
    { value: "practice", label: "Practice", description: "More clues" },
    { value: "challenge", label: "Challenge", description: "Fewer clues" },
  ],
  6: [
    { value: "practice", label: "Practice", description: "More clues" },
    { value: "challenge", label: "Challenge", description: "Fewer clues" },
  ],
  9: [
    { value: "easy", label: "Easy", description: "Most clues" },
    { value: "medium", label: "Medium", description: "Fewer clues" },
    { value: "hard", label: "Hard", description: "Fewest clues" },
  ],
};

function puzzleInstruction(mode: SudokuMode) {
  return mode === "shape"
    ? "Place each shape once in every row, column, and outlined box."
    : "Use each number once in every row, column, and outlined box.";
}

// Technique levels a human solver may need, from easiest to hardest.
// 1 naked single · 2 hidden single · 3 locked candidates (pointing/claiming) · 4 naked pair
type DifficultySpec = { clues: number; allowedMax: number; minRequired: number };

// Difficulty is graded by the hardest technique required to solve the puzzle WITHOUT guessing.
// - allowedMax: the puzzle must be fully solvable using techniques up to this level (kid-friendly cap).
// - minRequired: the puzzle must genuinely need at least this technique, so tiers stay distinct
//   and the harder tiers actually feel harder instead of just having more blanks.
const difficultySpec: Record<SudokuSize, Partial<Record<Difficulty, DifficultySpec>>> = {
  3: { mini: { clues: 6, allowedMax: 2, minRequired: 1 } },
  4: {
    practice: { clues: 11, allowedMax: 2, minRequired: 1 },
    // Small grids are solvable with the simplest technique regardless of blanks, so their
    // "challenge" comes from having more empty cells to reason through rather than harder logic.
    challenge: { clues: 8, allowedMax: 3, minRequired: 1 },
  },
  6: {
    practice: { clues: 24, allowedMax: 2, minRequired: 1 },
    challenge: { clues: 18, allowedMax: 3, minRequired: 1 },
  },
  9: {
    easy: { clues: 40, allowedMax: 2, minRequired: 1 },
    medium: { clues: 29, allowedMax: 3, minRequired: 2 },
    hard: { clues: 25, allowedMax: 4, minRequired: 3 },
  },
};

function seededRandom(seed: number) {
  let value = seed || 1;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const next = Math.floor(random() * (index + 1));
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}

function boxDimensions(size: SudokuSize): [number, number] {
  if (size === 4) return [2, 2];
  if (size === 6) return [2, 3];
  if (size === 9) return [3, 3];
  return [1, 3];
}

function makeSolution(size: SudokuSize, seed: number) {
  const random = seededRandom(seed);
  const [boxRows, boxCols] = boxDimensions(size);
  const rowBands = shuffle(Array.from({ length: size / boxRows }, (_, index) => index), random);
  const columnStacks = shuffle(Array.from({ length: size / boxCols }, (_, index) => index), random);
  const rows = rowBands.flatMap((band) => shuffle(Array.from({ length: boxRows }, (_, index) => band * boxRows + index), random));
  const columns = columnStacks.flatMap((stack) => shuffle(Array.from({ length: boxCols }, (_, index) => stack * boxCols + index), random));
  const symbols = shuffle(Array.from({ length: size }, (_, index) => index + 1), random);
  const pattern = (row: number, column: number) => (column + row * boxCols + Math.floor(row / boxRows)) % size;
  return rows.flatMap((row) => columns.map((column) => symbols[pattern(row, column)]));
}

function countSolutions(board: number[], size: SudokuSize, limit = 2) {
  const [boxRows, boxCols] = boxDimensions(size);
  let solutions = 0;
  const working = [...board];
  const valid = (index: number, value: number) => {
    const row = Math.floor(index / size);
    const column = index % size;
    for (let offset = 0; offset < size; offset++) {
      if (working[row * size + offset] === value || working[offset * size + column] === value) return false;
    }
    const firstRow = Math.floor(row / boxRows) * boxRows;
    const firstColumn = Math.floor(column / boxCols) * boxCols;
    for (let r = firstRow; r < firstRow + boxRows; r++) {
      for (let c = firstColumn; c < firstColumn + boxCols; c++) if (working[r * size + c] === value) return false;
    }
    return true;
  };
  const solve = () => {
    if (solutions >= limit) return;
    let empty = -1;
    let candidates: number[] = [];
    for (let index = 0; index < working.length; index++) {
      if (working[index] !== 0) continue;
      const options = Array.from({ length: size }, (_, value) => value + 1).filter((value) => valid(index, value));
      if (!options.length) return;
      if (empty < 0 || options.length < candidates.length) { empty = index; candidates = options; }
      if (options.length === 1) break;
    }
    if (empty < 0) { solutions++; return; }
    for (const value of candidates) {
      working[empty] = value;
      solve();
      working[empty] = 0;
      if (solutions >= limit) return;
    }
  };
  solve();
  return solutions;
}

// Row / column / box cell-index groups for a given board size (memoised per size).
const unitCache = new Map<SudokuSize, number[][]>();
function buildUnits(size: SudokuSize): number[][] {
  const cached = unitCache.get(size);
  if (cached) return cached;
  const [boxRows, boxCols] = boxDimensions(size);
  const units: number[][] = [];
  for (let r = 0; r < size; r++) units.push(Array.from({ length: size }, (_, c) => r * size + c));
  for (let c = 0; c < size; c++) units.push(Array.from({ length: size }, (_, r) => r * size + c));
  for (let br = 0; br < size; br += boxRows) for (let bc = 0; bc < size; bc += boxCols) {
    const box: number[] = [];
    for (let r = br; r < br + boxRows; r++) for (let c = bc; c < bc + boxCols; c++) box.push(r * size + c);
    units.push(box);
  }
  unitCache.set(size, units);
  return units;
}

const bitCount = (mask: number) => { let count = 0; while (mask) { count += mask & 1; mask >>= 1; } return count; };
const bitToValue = (mask: number) => { let value = 1; while (mask > 1) { mask >>= 1; value++; } return value; };

// Solve the way a person would: keep candidate sets and apply techniques from easiest to
// hardest, never guessing. Returns whether it solved and the hardest technique it needed.
function humanSolve(start: number[], size: SudokuSize, maxLevel: number): { solved: boolean; hardest: number } {
  const [boxRows, boxCols] = boxDimensions(size);
  const board = [...start];
  const full = (1 << size) - 1;
  const cand = new Array(size * size).fill(0);
  const computeCandidates = () => {
    for (let i = 0; i < board.length; i++) {
      if (board[i] !== 0) { cand[i] = 0; continue; }
      const row = Math.floor(i / size); const column = i % size;
      let used = 0;
      for (let k = 0; k < size; k++) {
        if (board[row * size + k]) used |= 1 << (board[row * size + k] - 1);
        if (board[k * size + column]) used |= 1 << (board[k * size + column] - 1);
      }
      const firstRow = Math.floor(row / boxRows) * boxRows;
      const firstColumn = Math.floor(column / boxCols) * boxCols;
      for (let r = firstRow; r < firstRow + boxRows; r++) for (let c = firstColumn; c < firstColumn + boxCols; c++) if (board[r * size + c]) used |= 1 << (board[r * size + c] - 1);
      cand[i] = full & ~used;
    }
  };
  const units = buildUnits(size);
  const boxes = units.slice(size * 2);

  const hiddenSingle = () => {
    for (const unit of units) {
      for (let v = 0; v < size; v++) {
        const bit = 1 << v; let cell = -1; let count = 0; let alreadyPlaced = false;
        for (const idx of unit) {
          if (board[idx] === v + 1) { alreadyPlaced = true; break; }
          if (board[idx] === 0 && (cand[idx] & bit)) { count++; cell = idx; }
        }
        if (!alreadyPlaced && count === 1) { board[cell] = v + 1; computeCandidates(); return true; }
      }
    }
    return false;
  };
  const lockedCandidates = () => {
    let removed = false;
    // Pointing: candidates for a value inside a box confined to one row/column clear that line elsewhere.
    for (const box of boxes) {
      for (let v = 0; v < size; v++) {
        const bit = 1 << v;
        const spots = box.filter((idx) => board[idx] === 0 && (cand[idx] & bit));
        if (spots.length < 2) continue;
        const rows = new Set(spots.map((idx) => Math.floor(idx / size)));
        const cols = new Set(spots.map((idx) => idx % size));
        if (rows.size === 1) {
          const row = [...rows][0];
          for (let c = 0; c < size; c++) { const idx = row * size + c; if (!box.includes(idx) && (cand[idx] & bit)) { cand[idx] &= ~bit; removed = true; } }
        }
        if (cols.size === 1) {
          const col = [...cols][0];
          for (let r = 0; r < size; r++) { const idx = r * size + col; if (!box.includes(idx) && (cand[idx] & bit)) { cand[idx] &= ~bit; removed = true; } }
        }
      }
    }
    // Claiming: candidates for a value in a row/column confined to one box clear the rest of that box.
    for (let u = 0; u < size * 2; u++) {
      const line = units[u];
      for (let v = 0; v < size; v++) {
        const bit = 1 << v;
        const spots = line.filter((idx) => board[idx] === 0 && (cand[idx] & bit));
        if (spots.length < 2) continue;
        const box = boxes.find((b) => spots.every((idx) => b.includes(idx)));
        if (!box) continue;
        for (const idx of box) if (!line.includes(idx) && (cand[idx] & bit)) { cand[idx] &= ~bit; removed = true; }
      }
    }
    return removed;
  };
  const nakedPair = () => {
    let removed = false;
    for (const unit of units) {
      const pairs = unit.filter((idx) => board[idx] === 0 && bitCount(cand[idx]) === 2);
      for (let a = 0; a < pairs.length; a++) for (let b = a + 1; b < pairs.length; b++) {
        if (cand[pairs[a]] !== cand[pairs[b]]) continue;
        const mask = cand[pairs[a]];
        for (const idx of unit) if (idx !== pairs[a] && idx !== pairs[b] && board[idx] === 0 && (cand[idx] & mask)) { cand[idx] &= ~mask; removed = true; }
      }
    }
    return removed;
  };

  computeCandidates();
  let hardest = 0;
  for (let guard = 0; guard < size * size * 4 + 20; guard++) {
    if (!board.includes(0)) return { solved: true, hardest };
    for (let i = 0; i < board.length; i++) if (board[i] === 0 && cand[i] === 0) return { solved: false, hardest };

    let placed = false;
    for (let i = 0; i < board.length; i++) if (board[i] === 0 && bitCount(cand[i]) === 1) { board[i] = bitToValue(cand[i]); computeCandidates(); hardest = Math.max(hardest, 1); placed = true; break; }
    if (placed) continue;
    if (maxLevel >= 2 && hiddenSingle()) { hardest = Math.max(hardest, 2); continue; }
    if (maxLevel >= 3 && lockedCandidates()) { hardest = Math.max(hardest, 3); continue; }
    if (maxLevel >= 4 && nakedPair()) { hardest = Math.max(hardest, 4); continue; }
    return { solved: false, hardest };
  }
  return { solved: false, hardest };
}

function carvePuzzle(solution: number[], size: SudokuSize, targetClues: number, seed: number): number[] {
  const [boxRows, boxCols] = boxDimensions(size);
  const boxesPerRow = size / boxCols;
  const boxOf = (index: number) =>
    Math.floor(Math.floor(index / size) / boxRows) * boxesPerRow + Math.floor((index % size) / boxCols);
  const rowOf = (index: number) => Math.floor(index / size);
  const colOf = (index: number) => index % size;

  const puzzle = [...solution];
  const random = seededRandom(seed);

  // Track how many clues remain in each box / row / column so removals stay balanced.
  const boxCount = Array(size).fill(size);
  const rowCount = Array(size).fill(size);
  const colCount = Array(size).fill(size);

  // A stable per-cell tiebreak so removal is randomised but even across units.
  const order = new Array<number>(size * size);
  shuffle(Array.from({ length: size * size }, (_, value) => value), random).forEach((cell, rank) => {
    order[cell] = rank;
  });

  // No unit should stay completely filled — that looks unnatural. Cap clues per box/row/column
  // just below full so at least one cell is always carved out of every unit.
  const boxCap = size - 1;

  const blocked = new Array<boolean>(size * size).fill(false);
  let filled = size * size;

  while (filled > targetClues) {
    // Prefer emptying the fullest box, then the fullest row/column, so no single unit stays packed.
    let best = -1;
    let bestScore = -Infinity;
    for (let index = 0; index < puzzle.length; index++) {
      if (puzzle[index] === 0 || blocked[index]) continue;
      const box = boxCount[boxOf(index)];
      // Boxes still at or above their cap must be reduced first to prevent a fully filled box.
      const overCap = box >= boxCap ? 1_000_000 : 0;
      const score = overCap + box * 1000 + (rowCount[rowOf(index)] + colCount[colOf(index)]) * 10 + order[index];
      if (score > bestScore) {
        bestScore = score;
        best = index;
      }
    }
    if (best === -1) break; // nothing left that can be safely removed

    const previous = puzzle[best];
    puzzle[best] = 0;
    if (countSolutions(puzzle, size) !== 1) {
      puzzle[best] = previous; // removal would create ambiguity — keep the clue
      blocked[best] = true;
      continue;
    }
    filled--;
    boxCount[boxOf(best)]--;
    rowCount[rowOf(best)]--;
    colCount[colOf(best)]--;
  }
  return puzzle;
}

function makePuzzle(size: SudokuSize, difficulty: Difficulty, seed: number): Puzzle {
  const spec = difficultySpec[size][difficulty] ?? { clues: Math.ceil(size * size * 0.5), allowedMax: 3, minRequired: 1 };
  let fallback: Puzzle | null = null;
  for (let attempt = 0; attempt < 16; attempt++) {
    const attemptSeed = (seed ^ 0x9e3779b9) + attempt * 0x2545f491;
    const solution = makeSolution(size, attemptSeed);
    const puzzle = carvePuzzle(solution, size, spec.clues, attemptSeed);
    const grade = humanSolve(puzzle, size, spec.allowedMax);
    if (!grade.solved) continue; // needs a technique harder than this tier allows → too hard for kids
    if (!fallback) fallback = { puzzle, solution }; // solvable within the cap, keep as a safety net
    if (grade.hardest >= spec.minRequired) return { puzzle, solution }; // hits the tier's difficulty floor
  }
  if (fallback) return fallback;
  const solution = makeSolution(size, seed);
  return { puzzle: carvePuzzle(solution, size, spec.clues, seed ^ 0x9e3779b9), solution };
}

function Shape({ value, className = "" }: { value: number; className?: string }) {
  if (value === 1) return <span className={`inline-block size-[42%] rounded-full border-[0.13em] border-current ${className}`} />;
  if (value === 2) return <span className={`inline-block size-[40%] border-[0.13em] border-current ${className}`} />;
  if (value === 3) return <span className={`inline-block h-0 w-0 border-x-[0.27em] border-b-[0.46em] border-x-transparent border-b-current ${className}`} />;
  return <span className={`inline-block size-[36%] rotate-45 border-[0.13em] border-current ${className}`} />;
}

function Grid({ values, size, mode, answer = false }: { values: number[]; size: SudokuSize; mode: SudokuMode; answer?: boolean }) {
  const [boxRows, boxCols] = boxDimensions(size);
  return <div className="grid aspect-square w-full border-2 border-[#202020] bg-white" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}>
    {values.map((value, index) => {
      const row = Math.floor(index / size); const column = index % size;
      const thickRight = column < size - 1 && (column + 1) % boxCols === 0;
      const thickBottom = row < size - 1 && (row + 1) % boxRows === 0;
      return <div key={index} className="grid place-items-center text-[#171717]" style={{ borderRight: column < size - 1 ? `${thickRight ? 2 : 0.7}px solid #333` : undefined, borderBottom: row < size - 1 ? `${thickBottom ? 2 : 0.7}px solid #333` : undefined, fontSize: `${Math.max(8, 33 / Math.sqrt(size))}px`, fontWeight: answer ? 500 : 700 }}>
        {value ? mode === "shape" ? <Shape value={value} /> : value : null}
      </div>;
    })}
  </div>;
}

function drawPdfSymbol(doc: import("jspdf").jsPDF, value: number, x: number, y: number, cell: number) {
  const radius = cell * 0.2;
  if (value === 1) doc.circle(x, y, radius);
  else if (value === 2) doc.rect(x - radius, y - radius, radius * 2, radius * 2);
  else if (value === 3) doc.triangle(x, y - radius * 1.2, x - radius * 1.1, y + radius, x + radius * 1.1, y + radius);
  else doc.lines([[radius, radius], [-radius, radius], [-radius, -radius], [radius, -radius]], x, y - radius, [1, 1], "S", true);
}

async function downloadPdf(puzzles: Puzzle[], size: SudokuSize, mode: SudokuMode, difficulty: Difficulty, paper: PaperSize, includeAnswerKey: boolean) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: paper, orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const drawPage = (answer: boolean) => {
    doc.setTextColor(24); doc.setDrawColor(30); doc.setLineCap("square");
    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(answer ? "Sudoku Answer Key" : "Sudoku Worksheet", 16, 16);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.text(`${size}×${size} · ${difficulty === "mini" ? "Mini" : difficulty[0].toUpperCase() + difficulty.slice(1)}`, pageWidth - 16, 16, { align: "right" });
    if (!answer) {
      doc.setFontSize(9); doc.text("Name:", 16, 24); doc.line(29, 24, pageWidth * 0.45, 24); doc.text("Date:", pageWidth * 0.56, 24); doc.line(pageWidth * 0.56 + 12, 24, pageWidth - 16, 24);
      doc.setFontSize(8); doc.setTextColor(85); doc.text(puzzleInstruction(mode), 16, 30); doc.setTextColor(24);
    }
    const top = answer ? 25 : 38;
    const columns = puzzles.length === 4 ? 2 : 1;
    const rows = puzzles.length === 1 ? 1 : 2;
    const gapX = 16; const gapY = 15;
    const maxWidth = (pageWidth - 32 - gapX * (columns - 1)) / columns;
    const maxHeight = (pageHeight - top - 16 - gapY * (rows - 1)) / rows;
    const gridSize = Math.min(maxWidth, maxHeight, puzzles.length === 1 ? 160 : 105);
    puzzles.forEach((item, puzzleIndex) => {
      const column = puzzleIndex % columns; const row = Math.floor(puzzleIndex / columns);
      const areaWidth = columns === 1 ? pageWidth - 32 : maxWidth;
      const x = 16 + column * (maxWidth + gapX) + (areaWidth - gridSize) / 2;
      const y = top + row * (maxHeight + gapY) + (maxHeight - gridSize) / 2;
      const cell = gridSize / size; const values = answer ? item.solution : item.puzzle;
      doc.setDrawColor(25); doc.setLineWidth(0.7); doc.rect(x, y, gridSize, gridSize);
      const [boxRows, boxCols] = boxDimensions(size);
      for (let line = 1; line < size; line++) {
        doc.setLineWidth(line % boxCols === 0 ? 0.7 : 0.2); doc.line(x + line * cell, y, x + line * cell, y + gridSize);
        doc.setLineWidth(line % boxRows === 0 ? 0.7 : 0.2); doc.line(x, y + line * cell, x + gridSize, y + line * cell);
      }
      doc.setFont("helvetica", answer ? "normal" : "bold"); doc.setFontSize(Math.max(9, cell * 1.65)); doc.setLineWidth(Math.max(0.25, cell * 0.08));
      values.forEach((value, index) => {
        if (!value) return;
        const centerX = x + (index % size + 0.5) * cell; const centerY = y + (Math.floor(index / size) + 0.5) * cell;
        if (mode === "shape") drawPdfSymbol(doc, value, centerX, centerY, cell);
        else doc.text(String(value), centerX, centerY + cell * 0.19, { align: "center" });
      });
    });
  };
  drawPage(false);
  if (includeAnswerKey) {
    doc.addPage(paper, "portrait");
    drawPage(true);
  }
  doc.save(`printlykiddo-${size}x${size}-sudoku-worksheet.pdf`);
}

export function SudokuMaker() {
  const [size, setSize] = useState<SudokuSize>(4);
  const [mode, setMode] = useState<SudokuMode>("number");
  const [difficulty, setDifficulty] = useState<Difficulty>("practice");
  const [layout, setLayout] = useState<PageLayout>(1);
  const [paper, setPaper] = useState<PaperSize>("letter");
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  const [seed, setSeed] = useState(20260713);
  const [isDownloading, setIsDownloading] = useState(false);
  const puzzles = useMemo(() => Array.from({ length: layout }, (_, index) => makePuzzle(size, difficulty, seed + index * 104729)), [size, difficulty, layout, seed]);
  const modes: Array<{ value: SudokuMode; label: string }> = size === 3 || size === 4
    ? [{ value: "number", label: "Numbers" }, { value: "shape", label: "Shapes" }]
    : [{ value: size === 9 ? "classic" : "number", label: size === 9 ? "Classic Sudoku" : "Number Sudoku" }];
  const shufflePuzzle = () => setSeed(Date.now());
  const chooseSize = (nextSize: SudokuSize) => {
    setSize(nextSize);
    setMode(nextSize === 9 ? "classic" : "number");
    setDifficulty(nextSize === 3 ? "mini" : nextSize === 9 ? "easy" : "practice");
  };
  const handleDownload = async () => {
    setIsDownloading(true);
    try { await downloadPdf(puzzles, size, mode, difficulty, paper, includeAnswerKey); }
    finally { setIsDownloading(false); }
  };

  const actionButtons = <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
    <button type="button" onClick={shufflePuzzle} className="rounded-xl border border-[#D9D3C8] bg-white px-5 py-3 text-sm font-bold text-chocolate transition hover:bg-[#FAF9F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2">
      Shuffle Puzzle
    </button>
    <button type="button" disabled={isDownloading} onClick={handleDownload} className="rounded-xl bg-brand px-5 py-3 text-sm font-bold text-brand-ink transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-active focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-55">
      {isDownloading ? "Creating PDF…" : "Download PDF"}
    </button>
  </div>;

  const controlClass = (selected: boolean) => `rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 ${selected ? "border-brand bg-brand-soft shadow-[inset_0_0_0_1px_rgba(228,185,62,.15)]" : "border-[#E7E2D9] bg-white hover:border-brand/50 hover:bg-[#FAFAFA]"}`;

  return <section className="mx-auto w-full max-w-[1180px] px-5 pb-20 pt-10 lg:px-10">
    <div className="mb-9 max-w-3xl">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-hover">Free printable generator</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-chocolate md:text-4xl">Create Printable Sudoku Worksheets for Kids</h1>
      <p className="mt-3 text-base leading-7 text-charcoal/62">Generate fun Sudoku puzzles for kids with different sizes and difficulty levels. Download and print instantly.</p>
    </div>
    <div className="grid items-start gap-7 lg:grid-cols-[360px_1fr]">
      <aside aria-labelledby="sudoku-settings-heading" className="rounded-2xl border border-[#E7E2D9] bg-white p-5 shadow-sm">
        <h2 id="sudoku-settings-heading" className="mb-5 text-lg font-bold text-chocolate">Create Sudoku Worksheet</h2>
        <fieldset><legend className="text-sm font-bold text-chocolate">Choose Grid Size</legend>
          <div className="mt-3 grid grid-cols-2 gap-2">{sizeOptions.map((option) => <button key={option.size} type="button" aria-pressed={size === option.size} onClick={() => chooseSize(option.size)} className={controlClass(size === option.size)}>
            <span className="block text-sm font-bold text-chocolate">{option.label}</span>
          </button>)}</div>
        </fieldset>
        {modes.length > 1 ? <fieldset className="mt-6"><legend className="text-sm font-bold text-chocolate">Puzzle Style</legend>
          <div className="mt-3 grid grid-cols-2 gap-2">{modes.map((option) => <button key={option.value} type="button" aria-pressed={mode === option.value} onClick={() => setMode(option.value)} className={controlClass(mode === option.value)}><span className="block text-sm font-bold text-chocolate">{option.label}</span></button>)}</div>
        </fieldset> : null}
        {size !== 3 ? <fieldset className="mt-6"><legend className="text-sm font-bold text-chocolate">Difficulty</legend>
          <div className={`mt-3 grid gap-2 ${difficultyOptions[size].length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>{difficultyOptions[size].map((option) => <button key={option.value} type="button" aria-pressed={difficulty === option.value} onClick={() => setDifficulty(option.value)} className={controlClass(difficulty === option.value)}><span className="block text-xs font-bold text-chocolate sm:text-sm">{option.label}</span><span className="mt-1 block text-[10px] leading-tight text-charcoal/55">{option.description}</span></button>)}</div>
        </fieldset> : null}
        <fieldset className="mt-6"><legend className="text-sm font-bold text-chocolate">Puzzles per Page</legend>
          <div className="mt-3 grid grid-cols-3 gap-2">{([1, 2, 4] as PageLayout[]).map((count) => <button key={count} type="button" aria-pressed={layout === count} onClick={() => setLayout(count)} className={`${controlClass(layout === count)} text-center text-xs font-bold text-chocolate sm:text-sm`}>{count} {count === 1 ? "Puzzle" : "Puzzles"}</button>)}</div>
        </fieldset>
        <fieldset className="mt-6"><legend className="text-sm font-bold text-chocolate">Paper Size</legend>
          <div className="mt-3 grid grid-cols-2 gap-2">{(["letter", "a4"] as PaperSize[]).map((value) => <button key={value} type="button" aria-pressed={paper === value} onClick={() => setPaper(value)} className={`${controlClass(paper === value)} text-center text-sm font-bold text-chocolate`}>{value === "letter" ? "US Letter" : "A4"}</button>)}</div>
        </fieldset>
        <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-[#E7E2D9] bg-white px-3 py-3 text-sm font-semibold text-chocolate transition hover:bg-[#FAFAFA]"><input type="checkbox" checked={includeAnswerKey} onChange={(event) => setIncludeAnswerKey(event.target.checked)} className="size-4 accent-brand" /><span>Include answer key</span></label>
      </aside>

      <div>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold text-chocolate">Worksheet Preview</p>
          {actionButtons}
        </div>
        <div className="overflow-hidden rounded-2xl border border-[#E7E2D9] bg-[#ECEAE5] p-4 shadow-sm sm:p-7">
          <div className={`mx-auto flex w-full max-w-[680px] flex-col bg-white px-[8%] pb-[6%] pt-[5%] shadow-[0_6px_22px_rgba(61,53,34,0.12)] ${paper === "letter" ? "aspect-[8.5/11]" : "aspect-[210/297]"}`}>
            <div className="flex items-baseline justify-between gap-3"><h2 className="text-sm font-bold leading-tight text-[#111] sm:text-lg">Sudoku Worksheet</h2><span className="shrink-0 text-[7px] text-[#555] sm:text-xs">{size}×{size} · {difficulty === "mini" ? "Mini" : difficulty[0].toUpperCase() + difficulty.slice(1)}</span></div>
            <div className="mt-[2%] flex items-center gap-2 text-[7px] text-[#333] sm:text-xs"><span className="font-semibold">Name:</span><span className="h-px flex-1 bg-[#777]" /><span className="ml-[4%] font-semibold">Date:</span><span className="h-px w-[24%] bg-[#777]" /></div>
            <p className="mt-[2%] text-[6px] leading-tight text-[#555] sm:text-[10px]">{puzzleInstruction(mode)}</p>
            <div className={`grid min-h-0 flex-1 place-items-center gap-[5%] pt-[3%] ${layout === 1 ? "grid-cols-1" : layout === 2 ? "grid-rows-2" : "grid-cols-2 grid-rows-2"}`}>
              {puzzles.map((puzzle, index) => <div key={`${seed}-${index}`} className={`aspect-square ${layout === 1 ? "w-[72%]" : layout === 2 ? "h-[86%] w-auto" : "w-[92%]"}`}><Grid values={puzzle.puzzle} size={size} mode={mode} /></div>)}
            </div>
            <p className="mt-[2%] text-center text-[6px] font-semibold tracking-wide text-[#999] sm:text-[9px]">PrintlyKiddo · Learning can be fun</p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-[#E7E2D9] bg-white px-4 py-3"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand-ink">{includeAnswerKey ? 2 : 1}</span><p className="text-xs leading-5 text-charcoal/60">{includeAnswerKey ? "PDF includes the worksheet and answer key." : "PDF includes the worksheet only."}</p></div>
      </div>
    </div>
  </section>;
}
