export type WordSearchDifficulty = "beginner" | "easy" | "challenge";

export type WordSearchTheme = {
  id: number;
  slug: string;
  name: string;
  description: string;
  words: string[];
  group: string;
  groupSlug: string;
  parentGroup: string;
  parentGroupSlug: string;
  categoryPath: string | null;
};

export type WordLibraryTopic = Pick<WordSearchTheme, "slug" | "name" | "words">;

export type WordLibraryGroup = {
  slug: string;
  name: string;
  topics: WordLibraryTopic[];
};

export type WordPlacement = {
  word: string;
  row: number;
  column: number;
  endRow: number;
  endColumn: number;
};

export type WordSearchPuzzle = {
  grid: string[][];
  words: string[];
  placements: WordPlacement[];
  size: number;
};

export const DIFFICULTY_OPTIONS: Array<{
  value: WordSearchDifficulty;
  label: string;
  detail: string;
  maximumLength: number;
  maximumWords: number;
}> = [
  { value: "beginner", label: "Beginner", detail: "8×8 · Up to 6 words · Across & down", maximumLength: 8, maximumWords: 6 },
  { value: "easy", label: "Easy", detail: "10×10 · Up to 10 words · Adds diagonals", maximumLength: 10, maximumWords: 10 },
  { value: "challenge", label: "Challenge", detail: "12×12+ · Up to 15 words · All directions", maximumLength: 15, maximumWords: 15 },
];

export function wordSearchLetters(word: string) {
  return word.toUpperCase().replace(/[^A-Z]/g, "");
}

export function normalizeWords(words: string[]) {
  const unique = new Map<string, string>();
  for (const word of words) {
    const display = word.toUpperCase().replace(/[^A-Z ]/g, "").trim().replace(/\s+/g, " ");
    const letters = wordSearchLetters(display);
    if (letters.length >= 2 && !unique.has(letters)) unique.set(letters, display);
  }
  return [...unique.values()];
}

function seededRandom(seed: number) {
  let value = seed >>> 0 || 1;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

type PuzzleWord = { display: string; letters: string };

function selectWords(words: string[], difficulty: WordSearchDifficulty, random: () => number): PuzzleWord[] {
  const option = DIFFICULTY_OPTIONS.find((item) => item.value === difficulty) ?? DIFFICULTY_OPTIONS[0];
  const normalized = normalizeWords(words).map((display) => ({ display, letters: wordSearchLetters(display) }));
  const available = normalized.filter((word) => word.letters.length <= option.maximumLength);
  const count = Math.min(option.maximumWords, available.length);
  const ranked = shuffle(available, random).sort((a, b) => difficulty === "challenge" ? b.letters.length - a.letters.length : a.letters.length - b.letters.length);
  const band = difficulty === "beginner" ? Math.min(ranked.length, Math.max(count + 3, 9)) : ranked.length;
  return shuffle(ranked.slice(0, band), random).slice(0, count).sort((a, b) => a.display.localeCompare(b.display));
}

// Try to place every word from `wordList` inside a `size`×`size` grid. Returns the finished
// puzzle (with random filler letters) or null if it could not fit them within the attempts.
function tryBuildGrid(
  wordList: PuzzleWord[],
  size: number,
  directions: Array<[number, number]>,
  random: () => number,
): WordSearchPuzzle | null {
  for (let attempt = 0; attempt < 60; attempt++) {
    const grid = Array.from({ length: size }, () => Array<string>(size).fill(""));
    const placements: WordPlacement[] = [];
    let failed = false;
    for (const entry of [...wordList].sort((a, b) => b.letters.length - a.letters.length)) {
      const word = entry.letters;
      const candidates: Array<{ row: number; column: number; dr: number; dc: number; overlap: number }> = [];
      for (const [dr, dc] of directions) for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) {
        const endRow = row + dr * (word.length - 1); const endColumn = column + dc * (word.length - 1);
        if (endRow < 0 || endRow >= size || endColumn < 0 || endColumn >= size) continue;
        let overlap = 0; let valid = true;
        for (let letter = 0; letter < word.length; letter++) {
          const current = grid[row + dr * letter][column + dc * letter];
          if (current && current !== word[letter]) { valid = false; break; }
          if (current === word[letter]) overlap++;
        }
        if (valid) candidates.push({ row, column, dr, dc, overlap });
      }
      if (!candidates.length) { failed = true; break; }
      const bestOverlap = Math.max(...candidates.map((candidate) => candidate.overlap));
      const preferred = candidates.filter((candidate) => candidate.overlap >= Math.max(0, bestOverlap - 1));
      const chosen = preferred[Math.floor(random() * preferred.length)];
      for (let letter = 0; letter < word.length; letter++) grid[chosen.row + chosen.dr * letter][chosen.column + chosen.dc * letter] = word[letter];
      placements.push({ word, row: chosen.row, column: chosen.column, endRow: chosen.row + chosen.dr * (word.length - 1), endColumn: chosen.column + chosen.dc * (word.length - 1) });
    }
    if (!failed) {
      for (let row = 0; row < size; row++) for (let column = 0; column < size; column++) if (!grid[row][column]) grid[row][column] = String.fromCharCode(65 + Math.floor(random() * 26));
      return { grid, words: wordList.map((word) => word.display), placements, size };
    }
  }
  return null;
}

export function generateWordSearch(words: string[], difficulty: WordSearchDifficulty, seed: number): WordSearchPuzzle {
  const random = seededRandom(seed);
  const selected = selectWords(words, difficulty, random);
  const directions: Array<[number, number]> = difficulty === "beginner"
    ? [[0, 1], [1, 0]]
    : difficulty === "easy"
      ? [[0, 1], [1, 0], [1, 1], [1, -1]]
      : [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  const longest = Math.max(...selected.map((word) => word.letters.length), 8);
  const baseSize = difficulty === "beginner" ? 8 : difficulty === "easy" ? 10 : longest > 12 || selected.length > 12 ? 15 : 12;
  // Never let the grid be smaller than the longest word, whatever the tier.
  const startSize = Math.max(baseSize, longest);

  // Degrade gracefully instead of throwing: first try the intended grid, then a couple of
  // larger grids, and only if that still fails drop the hardest-to-place (longest) word and
  // retry. This guarantees we always return a usable puzzle, even for awkward custom word lists.
  let pool = [...selected];
  while (pool.length) {
    for (const size of [startSize, startSize + 2, startSize + 4]) {
      const built = tryBuildGrid(pool, size, directions, random);
      if (built) return built;
    }
    const trimmed = [...pool].sort((a, b) => a.letters.length - b.letters.length).slice(0, pool.length - 1);
    pool = trimmed.sort((a, b) => a.display.localeCompare(b.display));
  }

  // Absolute fallback (e.g. no usable words at all): a plain filler grid with an empty word bank.
  const grid = Array.from({ length: startSize }, () => Array.from({ length: startSize }, () => String.fromCharCode(65 + Math.floor(random() * 26))));
  return { grid, words: [], placements: [], size: startSize };
}
