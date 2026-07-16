export type TracingLineType =
  | "straight"
  | "diagonal"
  | "curved"
  | "zigzag"
  | "wave"
  | "loops";

export type TracingDifficulty = "easy" | "medium" | "hard";

export type TracingPage = {
  type: TracingLineType;
  difficulty: TracingDifficulty;
  index: number;
  title: string;
  variant: string;
  fileName: string;
  svg: string;
};

export const TRACING_TYPE_OPTIONS: Array<{
  value: TracingLineType;
  label: string;
  description: string;
}> = [
  { value: "straight", label: "Straight Lines", description: "横线、竖线、长短线与混合直线" },
  { value: "diagonal", label: "Diagonal Lines", description: "斜线、V 形与山形方向控制" },
  { value: "curved", label: "Curved Lines", description: "C、S、U 与拱形曲线" },
  { value: "zigzag", label: "Zigzag Lines", description: "不同峰高和密度的连续折线" },
  { value: "wave", label: "Wave Lines", description: "不同振幅和周期的连续波浪" },
  { value: "loops", label: "Loops & Spirals", description: "圆环、连续环与螺旋线" },
];

const PAGE_WIDTH = 1275;
const PAGE_HEIGHT = 1650;
const LEFT = 150;
const RIGHT = 1125;

const VARIANTS: Record<TracingLineType, string[]> = {
  straight: ["Horizontal", "Vertical", "Long to Short", "Mixed Directions", "Stepping Lines"],
  diagonal: ["Downhill", "Uphill", "V Shapes", "Mountain Shapes", "Mixed Slants"],
  curved: ["Arches", "U Curves", "C Curves", "S Curves", "Mixed Curves"],
  zigzag: ["Big Peaks", "Small Peaks", "Wide Zigzags", "Tight Zigzags", "Mixed Peaks"],
  wave: ["Gentle Waves", "Big Waves", "Small Waves", "Growing Waves", "Mixed Waves"],
  loops: ["Circles", "Oval Loops", "Infinity Loops", "Spirals", "Mixed Loops"],
};

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[char] ?? char);
}

function linePath(x1: number, y1: number, x2: number, y2: number) {
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

function polylinePath(points: Array<[number, number]>) {
  return points.map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
}

function sinePath(y: number, amplitude: number, cycles: number, phase = 0) {
  const points: Array<[number, number]> = [];
  const samples = cycles * 24;
  for (let step = 0; step <= samples; step += 1) {
    const ratio = step / samples;
    points.push([
      LEFT + ratio * (RIGHT - LEFT),
      y + amplitude * Math.sin(ratio * cycles * Math.PI * 2 + phase),
    ]);
  }
  return polylinePath(points);
}

function zigzagPath(y: number, peaks: number, amplitude: number, offset = 0) {
  const points: Array<[number, number]> = [[LEFT, y]];
  const segments = peaks * 2;
  for (let step = 1; step <= segments; step += 1) {
    points.push([
      LEFT + ((RIGHT - LEFT) * step) / segments,
      y + (step % 2 === 1 ? -amplitude : 0) + offset,
    ]);
  }
  return polylinePath(points);
}

function spiralPath(cx: number, cy: number, turns: number, maxRadius: number, reverse = false) {
  const points: Array<[number, number]> = [];
  const samples = Math.ceil(turns * 48);
  for (let step = 0; step <= samples; step += 1) {
    const ratio = step / samples;
    const angle = ratio * turns * Math.PI * 2 * (reverse ? -1 : 1);
    const radius = 8 + ratio * maxRadius;
    points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return polylinePath(points);
}

function loopPath(y: number, loops: number, height: number) {
  const width = (RIGHT - LEFT) / loops;
  let path = `M ${LEFT} ${y}`;
  for (let index = 0; index < loops; index += 1) {
    const x = LEFT + index * width;
    path += ` C ${x + width * 0.18} ${y - height}, ${x + width * 0.82} ${y - height}, ${x + width} ${y}`;
    path += ` C ${x + width * 0.82} ${y + height}, ${x + width * 0.18} ${y + height}, ${x} ${y}`;
  }
  return path;
}

function createPaths(type: TracingLineType, variantIndex: number, difficulty: TracingDifficulty, pageIndex: number) {
  const difficultyLevel = { easy: 0, medium: 1, hard: 2 }[difficulty];
  const rowCount = 5 + difficultyLevel;
  const firstY = 470;
  const rowGap = 150 - difficultyLevel * 12;
  const paths: string[] = [];

  for (let row = 0; row < rowCount; row += 1) {
    const y = firstY + row * rowGap;
    const tweak = (pageIndex * 7 + row * 11) % 29;
    if (type === "straight") {
      if (variantIndex === 1) {
        const columns = 5 + difficultyLevel;
        const x = 210 + row * ((RIGHT - 260) / Math.max(1, rowCount - 1));
        paths.push(linePath(x, 420, x, 1390));
        if (row + 1 >= columns) break;
      } else if (variantIndex === 2) {
        paths.push(linePath(LEFT + row * 35, y, RIGHT - row * 75, y));
      } else if (variantIndex === 3) {
        const slope = row % 3 === 0 ? -55 : row % 3 === 1 ? 55 : 0;
        paths.push(linePath(LEFT, y, RIGHT, y + slope));
      } else if (variantIndex === 4) {
        const middle = LEFT + 400 + tweak * 4;
        paths.push(polylinePath([[LEFT, y], [middle, y], [middle, y - 55], [RIGHT, y - 55]]));
      } else {
        paths.push(linePath(LEFT, y, RIGHT - tweak * 3, y));
      }
    } else if (type === "diagonal") {
      const direction = variantIndex === 0 ? 1 : variantIndex === 1 ? -1 : row % 2 === 0 ? 1 : -1;
      if (variantIndex === 2) {
        paths.push(polylinePath([[LEFT, y - 55], [(LEFT + RIGHT) / 2, y + 55], [RIGHT, y - 55]]));
      } else if (variantIndex === 3) {
        paths.push(polylinePath([[LEFT, y + 55], [(LEFT + RIGHT) / 2, y - 55], [RIGHT, y + 55]]));
      } else {
        paths.push(linePath(LEFT, y - direction * 55, RIGHT, y + direction * 55));
      }
    } else if (type === "curved") {
      if (variantIndex === 1) {
        paths.push(`M ${LEFT} ${y - 60} Q ${(LEFT + RIGHT) / 2} ${y + 110 + tweak} ${RIGHT} ${y - 60}`);
      } else if (variantIndex === 2) {
        paths.push(`M ${LEFT + 90} ${y - 70} Q ${LEFT - 40} ${y} ${LEFT + 90} ${y + 70} T ${RIGHT} ${y}`);
      } else if (variantIndex === 3) {
        paths.push(`M ${LEFT} ${y} C ${LEFT + 230} ${y - 120}, ${LEFT + 270} ${y + 120}, ${(LEFT + RIGHT) / 2} ${y} S ${RIGHT - 220} ${y - 120}, ${RIGHT} ${y}`);
      } else if (variantIndex === 4) {
        paths.push(row % 2 === 0
          ? `M ${LEFT} ${y + 55} Q ${(LEFT + RIGHT) / 2} ${y - 105} ${RIGHT} ${y + 55}`
          : `M ${LEFT} ${y} C ${LEFT + 270} ${y - 100}, ${RIGHT - 270} ${y + 100}, ${RIGHT} ${y}`);
      } else {
        paths.push(`M ${LEFT} ${y + 55} Q ${(LEFT + RIGHT) / 2} ${y - 105 - tweak} ${RIGHT} ${y + 55}`);
      }
    } else if (type === "zigzag") {
      const peaks = variantIndex === 0 ? 4 : variantIndex === 1 ? 8 : variantIndex === 2 ? 5 : variantIndex === 3 ? 10 : 4 + ((row + pageIndex) % 6);
      paths.push(zigzagPath(y + 35, peaks + difficultyLevel, 55 + (variantIndex === 0 ? 25 : 0) + tweak / 2));
    } else if (type === "wave") {
      const cycles = variantIndex === 0 ? 3 : variantIndex === 1 ? 4 : variantIndex === 2 ? 7 : variantIndex === 3 ? 3 + row : 3 + ((row + pageIndex) % 5);
      const amplitude = variantIndex === 1 ? 65 : variantIndex === 2 ? 28 : 40 + (tweak % 20);
      paths.push(sinePath(y, amplitude, cycles + difficultyLevel, (row % 2) * Math.PI));
    } else {
      if (variantIndex === 3) {
        const centers = [300, 640, 975];
        paths.push(...centers.map((x, idx) => spiralPath(x, y, 2.2 + difficultyLevel * 0.4, 72, (row + idx) % 2 === 0)));
      } else if (variantIndex === 0) {
        const circles = 6 + difficultyLevel;
        const radius = 52 - difficultyLevel * 3;
        const gap = (RIGHT - LEFT) / circles;
        for (let index = 0; index < circles; index += 1) {
          const cx = LEFT + gap * (index + 0.5);
          paths.push(`M ${cx - radius} ${y} A ${radius} ${radius} 0 1 0 ${cx + radius} ${y} A ${radius} ${radius} 0 1 0 ${cx - radius} ${y}`);
        }
      } else if (variantIndex === 1) {
        paths.push(loopPath(y, 4 + difficultyLevel, 48 + tweak / 2));
      } else if (variantIndex === 2) {
        paths.push(loopPath(y, 3 + difficultyLevel, 72));
      } else {
        paths.push(row % 2 === 0 ? loopPath(y, 4 + difficultyLevel, 55) : sinePath(y, 60, 4 + difficultyLevel));
      }
    }
  }
  return paths;
}

function pathMarkup(path: string) {
  return `<g>
    <path d="${path}" fill="none" stroke="#cfd5dc" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" marker-start="url(#start-dot)" marker-end="url(#end-dot)" />
    <path d="${path}" fill="none" stroke="#263238" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 20" />
  </g>`;
}

export function generateTracingPage(options: {
  type: TracingLineType;
  difficulty: TracingDifficulty;
  index: number;
}): TracingPage {
  const { type, difficulty, index } = options;
  const typeInfo = TRACING_TYPE_OPTIONS.find((item) => item.value === type) ?? TRACING_TYPE_OPTIONS[0];
  const variantIndex = index % VARIANTS[type].length;
  const variant = VARIANTS[type][variantIndex];
  const paths = createPaths(type, variantIndex, difficulty, index);
  const guideColor = difficulty === "easy" ? "#64b5f6" : difficulty === "medium" ? "#81c784" : "#ffb74d";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}">
  <defs>
    <marker id="start-dot" markerWidth="4" markerHeight="4" refX="2" refY="2"><circle cx="2" cy="2" r="1.25" fill="#263238" /></marker>
    <marker id="end-dot" markerWidth="4" markerHeight="4" refX="2" refY="2"><circle cx="2" cy="2" r="1.25" fill="#ffffff" stroke="#263238" stroke-width="0.55" /></marker>
  </defs>
  <rect width="100%" height="100%" fill="#ffffff" />
  <rect x="45" y="45" width="1185" height="1560" rx="30" fill="none" stroke="#dfe5ea" stroke-width="4" />
  <text x="100" y="125" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="#5c6770">Name: ____________________</text>
  <text x="1175" y="125" text-anchor="end" font-family="Arial, Helvetica, sans-serif" font-size="32" fill="#5c6770">Date: __________</text>
  <text x="637.5" y="235" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="62" font-weight="700" fill="#202b33">${escapeXml(typeInfo.label)}</text>
  <text x="637.5" y="292" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#697780">${escapeXml(variant)} · ${difficulty[0].toUpperCase() + difficulty.slice(1)}</text>
  <rect x="150" y="332" width="975" height="64" rx="32" fill="${guideColor}" opacity="0.16" />
  <text x="637.5" y="374" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#455a64">Start at the dot and trace each path.</text>
  ${paths.map(pathMarkup).join("\n  ")}
  <text x="637.5" y="1550" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="24" fill="#a1aab0">PrintlyKiddo · Line Tracing Practice</text>
</svg>`;

  return {
    type,
    difficulty,
    index,
    title: typeInfo.label,
    variant,
    fileName: `${type}-lines-${difficulty}-${String(index + 1).padStart(2, "0")}`,
    svg,
  };
}

export function generateTracingCollection(options: {
  types: TracingLineType[];
  difficulty: TracingDifficulty;
  countPerType: number;
}) {
  return options.types.flatMap((type) =>
    Array.from({ length: options.countPerType }, (_, index) =>
      generateTracingPage({ type, difficulty: options.difficulty, index }),
    ),
  );
}

export const TRACING_PAGE_SIZE = { width: PAGE_WIDTH, height: PAGE_HEIGHT };
