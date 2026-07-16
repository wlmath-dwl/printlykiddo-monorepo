"use client";

import { useMemo, useState } from "react";

type Cell = { top: boolean; right: boolean; bottom: boolean; left: boolean; visited: boolean };
type Maze = { cells: Cell[]; size: number; solutionLength: number; deadEnds: number; branches: number; pathJunctions: number; solutionPath: number[] };
type Difficulty = "Preschool" | "Kindergarten" | "Elementary";
type PageLayout = 1 | 2 | 4;
type PaperSize = "letter" | "a4";

// Each level is tuned around a "Growing Tree" branch bias plus target metrics that
// describe how interesting the maze should feel (junctions on the solution path,
// dead-end density, and how long the correct route is relative to the grid).
const difficultyConfig: Record<Difficulty, {
  size: number;
  age: string;
  branchBias: number;
  targetJunctions: number;
  targetDeadEndRatio: number;
  targetPathRatio: number;
}> = {
  Preschool: { size: 8, age: "Ages 3–4", branchBias: 0.38, targetJunctions: 3, targetDeadEndRatio: 0.16, targetPathRatio: 0.3 },
  Kindergarten: { size: 12, age: "Ages 5–6", branchBias: 0.32, targetJunctions: 6, targetDeadEndRatio: 0.22, targetPathRatio: 0.38 },
  Elementary: { size: 18, age: "Ages 7+", branchBias: 0.26, targetJunctions: 11, targetDeadEndRatio: 0.28, targetPathRatio: 0.46 },
};

const ageLevelIcon: Record<Difficulty, string> = {
  Preschool: "🌱",
  Kindergarten: "🌿",
  Elementary: "🌳",
};

// "Growing Tree" carver (the family of algorithms mazegenerator.net is built on).
// branchBias controls how the next cell is chosen from the active frontier:
//   ~0   -> always the newest cell = recursive backtracker (long winding corridors,
//           few decision points, the "single path to the end" feeling we want to avoid)
//   ~1   -> a random cell = Prim-like (short, bushy dead ends, lots of junctions)
// A moderate bias keeps a clear main route while adding real choices along the way.
function generateCandidate(size: number, seed: number, branchBias: number): Maze {
  const cells: Cell[] = Array.from({ length: size * size }, () => ({ top: true, right: true, bottom: true, left: true, visited: false }));
  let value = seed || 1;
  const random = () => { value = (value * 1664525 + 1013904223) >>> 0; return value / 4294967296; };
  const active = [0];
  cells[0].visited = true;
  while (active.length) {
    const activeIndex = random() < branchBias ? Math.floor(random() * active.length) : active.length - 1;
    const current = active[activeIndex];
    const row = Math.floor(current / size); const col = current % size;
    const options: Array<[number, "top" | "right" | "bottom" | "left", "top" | "right" | "bottom" | "left"]> = [];
    if (row > 0 && !cells[current - size].visited) options.push([current - size, "top", "bottom"]);
    if (col < size - 1 && !cells[current + 1].visited) options.push([current + 1, "right", "left"]);
    if (row < size - 1 && !cells[current + size].visited) options.push([current + size, "bottom", "top"]);
    if (col > 0 && !cells[current - 1].visited) options.push([current - 1, "left", "right"]);
    if (!options.length) { active.splice(activeIndex, 1); continue; }
    const [next, wall, opposite] = options[Math.floor(random() * options.length)];
    cells[current][wall] = false; cells[next][opposite] = false; cells[next].visited = true; active.push(next);
  }
  cells[0].left = false; cells[cells.length - 1].right = false;

  // BFS from the entrance keeps distances plus a parent link so we can walk the
  // exact solution path back from the exit and measure how many real choices it has.
  const distances = Array(cells.length).fill(-1) as number[]; distances[0] = 0;
  const parent = Array(cells.length).fill(-1) as number[];
  const queue = [0];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor]; const cell = cells[index];
    const neighbors = [[!cell.top, index - size], [!cell.right, index + 1], [!cell.bottom, index + size], [!cell.left, index - 1]] as const;
    for (const [open, next] of neighbors) if (open && next >= 0 && next < cells.length && distances[next] < 0) { distances[next] = distances[index] + 1; parent[next] = index; queue.push(next); }
  }
  const openings = (cell: Cell) => Number(!cell.top) + Number(!cell.right) + Number(!cell.bottom) + Number(!cell.left);

  let pathJunctions = 0;
  for (let node = parent[cells.length - 1]; node > 0; node = parent[node]) {
    if (openings(cells[node]) >= 3) pathJunctions++;
  }
  const solutionPath: number[] = [];
  for (let node = cells.length - 1; node >= 0; node = parent[node]) solutionPath.push(node);
  solutionPath.reverse();

  return {
    cells,
    size,
    solutionLength: distances[cells.length - 1],
    deadEnds: cells.filter((cell) => openings(cell) === 1).length,
    branches: cells.filter((cell) => openings(cell) >= 3).length,
    pathJunctions,
    solutionPath,
  };
}

function makeValidatedMaze(difficulty: Difficulty, seed: number): Maze {
  const { size, branchBias, targetJunctions, targetDeadEndRatio, targetPathRatio } = difficultyConfig[difficulty];
  const total = size * size;
  // Sweep a few bias values around the level's baseline so we can hunt for a maze that
  // hits the target number of decision points, dead-end density, and route length.
  const biases = [branchBias - 0.12, branchBias, branchBias + 0.12, branchBias + 0.26];
  let best = generateCandidate(size, seed, branchBias); let bestScore = Infinity;
  for (let attempt = 0; attempt < 24; attempt++) {
    const bias = Math.min(0.85, Math.max(0.08, biases[attempt % biases.length]));
    const candidate = generateCandidate(size, seed + attempt * 7919, bias);
    const junctionScore = Math.abs(candidate.pathJunctions - targetJunctions) / targetJunctions;
    const deadEndScore = Math.abs(candidate.deadEnds / total - targetDeadEndRatio);
    const pathScore = Math.abs(candidate.solutionLength / total - targetPathRatio);
    // Junctions on the solution path matter most: they are what turns a boring corridor
    // into a maze with genuine choices, while dead ends keep it from getting overwhelming.
    const score = junctionScore * 1.4 + deadEndScore * 1.5 + pathScore * 0.8;
    if (candidate.pathJunctions >= 1 && score < bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}

function MazeSvg({ maze, id }: { maze: Maze; id: string }) {
  const unit = 480 / maze.size;
  return <svg viewBox="-34 -26 548 532" className="h-auto w-full" role="img" aria-label="Classic printable maze">
    <text x="0" y="-9" fontSize="14" fontWeight="700" fill="#111">START</text>
    {maze.cells.map((cell, index) => { const x = (index % maze.size) * unit; const y = Math.floor(index / maze.size) * unit; return <g key={`${id}-${index}`} stroke="#111" strokeWidth={Math.max(2, 22 / maze.size)} strokeLinecap="square">{cell.top && <line x1={x} y1={y} x2={x + unit} y2={y} />}{cell.right && <line x1={x + unit} y1={y} x2={x + unit} y2={y + unit} />}{cell.bottom && <line x1={x} y1={y + unit} x2={x + unit} y2={y + unit} />}{cell.left && <line x1={x} y1={y} x2={x} y2={y + unit} />}</g>; })}
    <text x="480" y="500" textAnchor="end" fontSize="14" fontWeight="700" fill="#111">END</text>
  </svg>;
}

async function downloadPdf(mazes: Maze[], difficulty: Difficulty, paperSize: PaperSize, includeAnswerKey: boolean) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: paperSize, orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  doc.setTextColor(20); doc.setDrawColor(20); doc.setLineCap("square");
  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("Maze Worksheet", 18, 16);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(`Level: ${difficulty}`, pageWidth - 18, 16, { align: "right" });
  doc.setFontSize(9); doc.text("Name:", 18, 23); doc.line(31, 23, pageWidth * 0.44, 23); doc.text("Date:", pageWidth * 0.56, 23); doc.line(pageWidth * 0.56 + 13, 23, pageWidth - 18, 23);
  const singleSize = Math.min(150, pageWidth - 60, pageHeight - 70);
  const doubleSize = Math.min(108, pageWidth - 60, (pageHeight - 70) / 2);
  const fourSize = Math.min((pageWidth - 48) / 2, (pageHeight - 76) / 2);
  const positions = mazes.length === 1
    ? [{ x: (pageWidth - singleSize) / 2, y: 33, size: singleSize }]
    : mazes.length === 2
      ? [{ x: (pageWidth - doubleSize) / 2, y: 31, size: doubleSize }, { x: (pageWidth - doubleSize) / 2, y: pageHeight - 31 - doubleSize, size: doubleSize }]
      : [{ x: 16, y: 35, size: fourSize }, { x: pageWidth - 16 - fourSize, y: 35, size: fourSize }, { x: 16, y: pageHeight - 35 - fourSize, size: fourSize }, { x: pageWidth - 16 - fourSize, y: pageHeight - 35 - fourSize, size: fourSize }];
  const drawMazes = (showSolution: boolean) => mazes.forEach((maze, mazeIndex) => {
    const position = positions[mazeIndex]; const cell = position.size / maze.size;
    doc.setTextColor(20); doc.setDrawColor(20);
    doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.text("START", position.x, position.y - 3);
    doc.text("END", position.x + position.size, position.y + position.size + 5, { align: "right" });
    doc.setLineWidth(Math.max(0.22, 1.25 / maze.size));
    maze.cells.forEach((mazeCell, index) => { const x = position.x + (index % maze.size) * cell; const y = position.y + Math.floor(index / maze.size) * cell; if (mazeCell.top) doc.line(x, y, x + cell, y); if (mazeCell.right) doc.line(x + cell, y, x + cell, y + cell); if (mazeCell.bottom) doc.line(x, y + cell, x + cell, y + cell); if (mazeCell.left) doc.line(x, y, x, y + cell); });
    if (showSolution) {
      const points = [
        { x: position.x - cell * 0.35, y: position.y + cell / 2 },
        ...maze.solutionPath.map((index) => ({ x: position.x + (index % maze.size) * cell + cell / 2, y: position.y + Math.floor(index / maze.size) * cell + cell / 2 })),
        { x: position.x + position.size + cell * 0.35, y: position.y + position.size - cell / 2 },
      ];
      doc.setDrawColor(217, 119, 6); doc.setLineWidth(Math.max(0.7, cell * 0.18)); doc.setLineCap("round");
      for (let index = 1; index < points.length; index++) doc.line(points[index - 1].x, points[index - 1].y, points[index].x, points[index].y);
      doc.setLineCap("square");
    }
  });
  drawMazes(false);
  if (includeAnswerKey) {
    doc.addPage(paperSize, "portrait");
    doc.setTextColor(20); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text("Answer Key", 18, 16);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.text(`Level: ${difficulty}`, pageWidth - 18, 16, { align: "right" });
    drawMazes(true);
  }
  doc.save(`printlykiddo-${difficulty.toLowerCase()}-mazes.pdf`);
}

export function MazeMaker() {
  const [difficulty, setDifficulty] = useState<Difficulty>("Preschool");
  const [layout, setLayout] = useState<PageLayout>(1);
  const [paperSize, setPaperSize] = useState<PaperSize>("letter");
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  const [seed, setSeed] = useState(20260713);
  const [isDownloading, setIsDownloading] = useState(false);
  const mazes = useMemo(() => Array.from({ length: layout }, (_, index) => makeValidatedMaze(difficulty, seed + index * 104729)), [difficulty, layout, seed]);
  const shuffleMaze = () => setSeed(Date.now());
  const chooseDifficulty = (nextDifficulty: Difficulty) => {
    setDifficulty(nextDifficulty);
    if (nextDifficulty === "Elementary" && layout === 4) setLayout(2);
  };
  const handleDownload = async () => { setIsDownloading(true); try { await downloadPdf(mazes, difficulty, paperSize, includeAnswerKey); } finally { setIsDownloading(false); } };

  const actionButtons = <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
    <button type="button" onClick={shuffleMaze} className="rounded-xl border border-[#D9D3C8] bg-white px-5 py-3 text-sm font-bold text-chocolate transition hover:bg-[#FAF9F6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2">Shuffle Maze</button>
    <button type="button" disabled={isDownloading} onClick={handleDownload} className="rounded-xl bg-brand px-5 py-3 text-sm font-bold text-brand-ink transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-active focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-55">{isDownloading ? "Creating PDF…" : "Download PDF"}</button>
  </div>;

  return <section className="mx-auto w-full max-w-[1180px] px-5 pb-20 pt-10 lg:px-10">
    <div className="mb-9 max-w-3xl">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-hover">Free printable generator</p>
      <h1 className="mt-3 text-3xl font-bold tracking-tight text-chocolate md:text-4xl">Create Printable Maze Worksheets for Kids</h1>
      <p className="mt-3 text-base leading-7 text-charcoal/62">Create printable mazes for preschool, kindergarten, and elementary learners. Choose a difficulty, then download and print.</p>
    </div>
    <div className="grid items-start gap-7 lg:grid-cols-[340px_1fr]">
      <aside aria-label="Maze worksheet settings" className="rounded-2xl border border-[#E7E2D9] bg-white p-5 shadow-sm">
        <fieldset><legend className="text-sm font-bold text-chocolate">Choose Difficulty</legend><div className="mt-3 grid gap-2">{(Object.keys(difficultyConfig) as Difficulty[]).map((level) => <button key={level} type="button" aria-pressed={difficulty === level} onClick={() => chooseDifficulty(level)} className={`flex w-full items-center rounded-xl border px-3 py-2.5 text-left text-chocolate transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 ${difficulty === level ? "border-brand bg-brand-soft" : "border-[#E7E2D9] bg-white hover:border-brand/45 hover:bg-[#FAFAFA]"}`}><span className="w-7 shrink-0 text-base leading-none" aria-hidden>{ageLevelIcon[level]}</span><span className="min-w-0 flex-1"><span className="block text-sm font-bold leading-tight">{level}</span><span className="mt-0.5 block text-xs font-normal text-charcoal/60">{difficultyConfig[level].size}×{difficultyConfig[level].size} · {difficultyConfig[level].age}</span></span></button>)}</div></fieldset>
        <fieldset className="mt-6"><legend className="text-sm font-bold text-chocolate">Paper Size</legend><div className="mt-3 grid grid-cols-2 gap-2">{(["letter", "a4"] as PaperSize[]).map((size) => <button key={size} type="button" aria-pressed={paperSize === size} onClick={() => setPaperSize(size)} className={`rounded-xl border px-3 py-2.5 text-sm font-bold text-chocolate transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 ${paperSize === size ? "border-brand bg-brand-soft" : "border-[#E7E2D9] bg-white hover:border-brand/45 hover:bg-[#FAFAFA]"}`}>{size === "letter" ? "US Letter" : "A4"}</button>)}</div></fieldset>
        <fieldset className="mt-6"><legend className="text-sm font-bold text-chocolate">Mazes per Page</legend><div className={`mt-3 grid gap-2 ${difficulty === "Elementary" ? "grid-cols-2" : "grid-cols-3"}`}>{(difficulty === "Elementary" ? [1, 2] : [1, 2, 4]).map((count) => <button key={count} type="button" aria-pressed={layout === count} onClick={() => setLayout(count as PageLayout)} className={`rounded-xl border px-2 py-3 text-sm font-bold text-chocolate transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 ${layout === count ? "border-brand bg-brand-soft" : "border-[#E7E2D9] bg-white hover:border-brand/45 hover:bg-[#FAFAFA]"}`}>{count} {count === 1 ? "Maze" : "Mazes"}</button>)}</div>{difficulty === "Elementary" ? <p className="mt-2 text-xs leading-5 text-charcoal/55">Up to 2 per page keeps the 18×18 maze easy to read and trace.</p> : null}</fieldset>
        <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-xl border border-[#E7E2D9] bg-white px-3 py-3 text-sm font-semibold text-chocolate transition hover:bg-[#FAFAFA]"><input type="checkbox" checked={includeAnswerKey} onChange={(event) => setIncludeAnswerKey(event.target.checked)} className="size-4 accent-brand" /><span>Include answer key</span></label>
      </aside>
      <div>
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-bold text-chocolate">Worksheet Preview</p>
          {actionButtons}
        </div>
        <div className="overflow-hidden rounded-2xl border border-[#E7E2D9] bg-[#ECEAE5] p-4 shadow-sm sm:p-7">
          <div className={`mx-auto flex w-full max-w-[680px] flex-col bg-white px-[8%] pb-[5%] pt-[3%] shadow-[0_6px_22px_rgba(61,53,34,0.12)] ${paperSize === "letter" ? "aspect-[8.5/11]" : "aspect-[210/297]"}`}>
            <div className="flex items-baseline justify-between gap-3"><h2 className="text-sm font-bold leading-tight text-[#111] sm:text-lg">Maze Worksheet</h2><span className="shrink-0 text-[8px] text-[#555] sm:text-xs">Level: {difficulty}</span></div>
            <div className="mt-[2%] flex items-center gap-2 text-[7px] text-[#333] sm:text-xs"><span className="font-semibold">Name:</span><span className="h-px flex-1 bg-[#777]" /><span className="ml-[4%] font-semibold">Date:</span><span className="h-px w-[24%] bg-[#777]" /></div>
            <div className={`grid min-h-0 flex-1 items-center justify-items-center overflow-hidden pt-[2%] ${layout === 1 ? "grid-cols-1" : layout === 2 ? "grid-cols-1 grid-rows-2" : "grid-cols-2 grid-rows-2 gap-x-[7%]"}`}>
              {mazes.map((maze, index) => <div key={`${seed}-${index}`} className={`flex max-h-full w-full items-center justify-center overflow-hidden ${layout === 1 ? "max-w-[86%]" : layout === 2 ? "max-w-[48%]" : "max-w-full"}`}><MazeSvg maze={maze} id={`${seed}-${index}`} /></div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>;
}
