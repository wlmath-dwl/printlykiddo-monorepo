export const PUZZLE_PAGE_CONFIGS = [
  {
    family: "sudoku",
    familyLabel: "数独",
    slug: "4x4-sudoku",
    title: "4x4 Sudoku",
    variant: "4x4",
    description: "Beginner-friendly 4x4 Sudoku worksheets for young learners.",
    seoTitle: "Free Printable 4x4 Sudoku Worksheets for Kids",
    seoDescription: "Download free printable 4x4 Sudoku worksheets with answer keys for early learners.",
    difficulties: ["easy"],
  },
  {
    family: "sudoku",
    familyLabel: "数独",
    slug: "6x6-sudoku",
    title: "6x6 Sudoku",
    variant: "6x6",
    description: "Printable 6x6 Sudoku worksheets with progressive practice for kids.",
    seoTitle: "Free Printable 6x6 Sudoku Worksheets for Kids",
    seoDescription: "Download free printable 6x6 Sudoku worksheets in easy and medium levels with answer keys.",
    difficulties: ["easy", "medium"],
  },
  {
    family: "sudoku",
    familyLabel: "数独",
    slug: "9x9-sudoku",
    title: "9x9 Sudoku",
    variant: "9x9",
    description: "Classic printable 9x9 Sudoku worksheets from easy to challenging.",
    seoTitle: "Free Printable 9x9 Sudoku Worksheets",
    seoDescription: "Download free printable 9x9 Sudoku worksheets in easy, medium, and hard levels with answer keys.",
    difficulties: ["easy", "medium", "hard"],
  },
  {
    family: "mazes",
    familyLabel: "迷宫",
    slug: "printable-mazes",
    title: "Printable Mazes",
    variant: "rectangle",
    description: "Printable rectangular maze worksheets in three kid-friendly difficulty levels.",
    seoTitle: "Free Printable Maze Worksheets for Kids",
    seoDescription: "Download free printable rectangular maze worksheets in easy, medium, and hard levels with answer keys.",
    difficulties: ["easy", "medium", "hard"],
  },
  {
    family: "mazes",
    familyLabel: "迷宫",
    slug: "circle-mazes",
    title: "Circle Mazes",
    variant: "circle",
    description: "Printable circular maze worksheets with easy, medium, and hard challenges.",
    seoTitle: "Free Printable Circle Maze Worksheets for Kids",
    seoDescription: "Download free printable circle maze worksheets in three difficulty levels with answer keys.",
    difficulties: ["easy", "medium", "hard"],
  },
] as const;

export type PuzzlePageConfig = (typeof PUZZLE_PAGE_CONFIGS)[number];
export type PuzzlePageSlug = PuzzlePageConfig["slug"];
export type PuzzleFamily = PuzzlePageConfig["family"];
export type PuzzleDifficulty = "easy" | "medium" | "hard";

export function getPuzzlePageConfig(slug: string) {
  return PUZZLE_PAGE_CONFIGS.find((item) => item.slug === slug) ?? null;
}

export function listPuzzlePageConfigs(family?: PuzzleFamily) {
  return family
    ? PUZZLE_PAGE_CONFIGS.filter((item) => item.family === family)
    : [...PUZZLE_PAGE_CONFIGS];
}
