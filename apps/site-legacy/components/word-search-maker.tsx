"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import {
  DIFFICULTY_OPTIONS,
  generateWordSearch,
  normalizeWords,
  wordSearchLetters,
  type WordSearchDifficulty,
  type WordLibraryGroup,
  type WordSearchPuzzle,
  type WordSearchTheme,
} from "@/lib/word-search";

type PaperSize = "letter" | "a4";

function WordLibraryModal({ groups, open, onClose }: { groups: WordLibraryGroup[]; open: boolean; onClose: () => void }) {
  const [activeGroup, setActiveGroup] = useState(groups[0]?.slug ?? "");
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);
  if (!open) return null;
  const group = groups.find((item) => item.slug === activeGroup) ?? groups[0];
  if (!group) return null;
  return <div className="fixed inset-0 z-[80] grid place-items-center bg-[#2F291F]/45 p-4" role="presentation" onMouseDown={(event) => { if (!dialogRef.current?.contains(event.target as Node)) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="word-library-title" className="flex max-h-[min(680px,90vh)] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-[#E2DCD2] bg-white shadow-[0_24px_70px_rgba(39,32,21,0.24)]">
      <div className="flex items-start justify-between gap-4 border-b border-[#ECE7DE] px-5 py-4 sm:px-6">
        <h2 id="word-library-title" className="text-xl font-bold text-chocolate">Choose a Theme</h2>
        <button type="button" aria-label="Close theme picker" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-lg text-xl text-charcoal/55 transition hover:bg-[#F3F0EA]">×</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <nav aria-label="Topic categories" className="flex gap-6 overflow-x-auto border-b border-[#E6E0D6] px-5 sm:px-6">
          {groups.map((item) => <button key={item.slug} type="button" aria-pressed={activeGroup === item.slug} onClick={() => setActiveGroup(item.slug)} className={`shrink-0 border-b-2 px-0 py-4 text-sm font-bold transition ${activeGroup === item.slug ? "border-brand text-chocolate" : "border-transparent text-chocolate/50 hover:text-chocolate"}`}>{item.name}</button>)}
        </nav>
        <div className="min-h-0 p-4 sm:p-6">
          <div className="grid gap-x-10 gap-y-1 sm:grid-cols-2">{group.topics.map((topic) => <Link key={topic.slug} href={`/tools/word-search-generator/${topic.slug}`} onClick={onClose} className="py-3 text-left text-sm font-bold text-chocolate transition hover:text-brand-hover">{topic.name}</Link>)}</div>
        </div>
      </div>
    </div>
  </div>;
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function WordGrid({ puzzle, answer = false }: { puzzle: WordSearchPuzzle; answer?: boolean }) {
  const solved = useMemo(() => {
    const cells = new Set<string>();
    if (answer) for (const placement of puzzle.placements) {
      const dr = Math.sign(placement.endRow - placement.row); const dc = Math.sign(placement.endColumn - placement.column);
      for (let index = 0; index < placement.word.length; index++) cells.add(`${placement.row + dr * index}-${placement.column + dc * index}`);
    }
    return cells;
  }, [answer, puzzle]);
  return <div className="relative grid aspect-square w-full border-2 border-[#29251F] bg-white" style={{ gridTemplateColumns: `repeat(${puzzle.size}, minmax(0, 1fr))` }}>
    {puzzle.grid.flatMap((row, rowIndex) => row.map((letter, columnIndex) => {
      const highlighted = solved.has(`${rowIndex}-${columnIndex}`);
      return <span key={`${rowIndex}-${columnIndex}`} className={`grid aspect-square place-items-center font-mono font-bold leading-none text-[#202020] ${highlighted ? "bg-[#FFE69A]" : ""}`} style={{ fontSize: `clamp(8px, ${puzzle.size > 12 ? 1.55 : 2.15}vw, ${puzzle.size > 12 ? 16 : 21}px)` }}>{letter}</span>;
    }))}
  </div>;
}

async function downloadWordSearchPdf(theme: WordSearchTheme, puzzle: WordSearchPuzzle, difficulty: WordSearchDifficulty, paper: PaperSize, includeAnswerKey: boolean) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: paper, orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const drawPage = (answer: boolean) => {
    const margin = 16; const title = answer ? `${theme.name} Word Search Answer Key` : `${theme.name} Word Search`;
    doc.setTextColor(40, 35, 28); doc.setDrawColor(40, 35, 28);
    doc.setFont("helvetica", "bold"); doc.setFontSize(answer ? 16 : 19); doc.text(title, margin, 18);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.text(`${titleCase(difficulty)} · ${puzzle.size}×${puzzle.size}`, pageWidth - margin, 18, { align: "right" });
    if (!answer) {
      doc.setFontSize(9); doc.text("Name:", margin, 27); doc.line(28, 27, pageWidth * 0.48, 27); doc.text("Date:", pageWidth * 0.57, 27); doc.line(pageWidth * 0.57 + 12, 27, pageWidth - margin, 27);
      doc.setFontSize(9); doc.text("Find and circle every hidden word.", margin, 34);
    } else { doc.setFontSize(9); doc.text("The hidden words are highlighted below.", margin, 27); }
    const gridTop = answer ? 35 : 41;
    const wordRows = Math.ceil(puzzle.words.length / 3);
    const wordArea = wordRows * 7 + 10;
    const maxGrid = Math.min(pageWidth - margin * 2, pageHeight - gridTop - wordArea - 25, 165);
    const gridX = (pageWidth - maxGrid) / 2; const cell = maxGrid / puzzle.size;
    if (answer) {
      doc.setDrawColor(241, 180, 36); doc.setLineWidth(Math.max(2.2, cell * 0.58)); doc.setLineCap("round");
      for (const placement of puzzle.placements) {
        const x1 = gridX + (placement.column + 0.5) * cell; const y1 = gridTop + (placement.row + 0.5) * cell;
        const x2 = gridX + (placement.endColumn + 0.5) * cell; const y2 = gridTop + (placement.endRow + 0.5) * cell;
        doc.line(x1, y1, x2, y2);
      }
    }
    doc.setDrawColor(40, 35, 28); doc.setLineWidth(0.7); doc.rect(gridX, gridTop, maxGrid, maxGrid);
    doc.setFont("courier", "bold"); doc.setFontSize(Math.min(14, cell * 2.2)); doc.setTextColor(25, 25, 25);
    puzzle.grid.forEach((row, rowIndex) => row.forEach((letter, columnIndex) => doc.text(letter, gridX + (columnIndex + 0.5) * cell, gridTop + (rowIndex + 0.5) * cell + cell * 0.22, { align: "center" })));
    const wordsTop = gridTop + maxGrid + 10;
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(40, 35, 28); doc.text(answer ? "WORDS" : "WORD BANK", margin, wordsTop);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    const columnWidth = (pageWidth - margin * 2) / 3;
    puzzle.words.forEach((word, index) => doc.text(word, margin + (index % 3) * columnWidth, wordsTop + 7 + Math.floor(index / 3) * 7));
    doc.setFontSize(7.5); doc.setTextColor(125, 116, 102); doc.text("PrintlyKiddo · Free printables for home and classroom", pageWidth / 2, pageHeight - 10, { align: "center" });
  };
  drawPage(false);
  if (includeAnswerKey) { doc.addPage(paper, "portrait"); drawPage(true); }
  doc.save(`printlykiddo-${theme.slug}-${difficulty}-word-search.pdf`);
}

export function WordSearchMaker({ themes, library, initialThemeSlug }: { themes: WordSearchTheme[]; library: WordLibraryGroup[]; initialThemeSlug?: string }) {
  const initial = themes.find((theme) => theme.slug === initialThemeSlug) ?? themes[0];
  const [difficulty, setDifficulty] = useState<WordSearchDifficulty>("beginner");
  const [paper, setPaper] = useState<PaperSize>("letter");
  const [includeAnswerKey, setIncludeAnswerKey] = useState(true);
  const [seed, setSeed] = useState(20260713);
  const [isDownloading, setIsDownloading] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [worksheetName, setWorksheetName] = useState(initial.name);
  const [wordsInput, setWordsInput] = useState(initial.words.join(", "));
  const theme = initial;
  const inputWords = useMemo(() => normalizeWords(wordsInput.split(/[\n,，]+/).map((word) => word.trim()).filter(Boolean)), [wordsInput]);
  const puzzleWords = inputWords;
  const puzzle = useMemo(() => generateWordSearch(puzzleWords, difficulty, seed), [puzzleWords, difficulty, seed]);
  const difficultyOption = DIFFICULTY_OPTIONS.find((option) => option.value === difficulty) ?? DIFFICULTY_OPTIONS[0];
  const usedWordKeys = useMemo(() => new Set(puzzle.words.map(wordSearchLetters)), [puzzle.words]);
  const excludedWords = inputWords.filter((word) => !usedWordKeys.has(wordSearchLetters(word)));
  const tooLongWords = excludedWords.filter((word) => wordSearchLetters(word).length > difficultyOption.maximumLength);
  const otherExcludedCount = excludedWords.length - tooLongWords.length;
  const worksheetTheme = useMemo(() => ({ ...theme, name: worksheetName, slug: worksheetName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "custom" }), [theme, worksheetName]);
  const controlClass = (selected: boolean) => `rounded-xl border px-3 py-3 text-left transition ${selected ? "border-brand bg-brand-soft shadow-[inset_0_0_0_1px_rgba(228,185,62,.15)]" : "border-[#E7E2D9] bg-white hover:border-brand/50 hover:bg-[#FAFAFA]"}`;
  const shufflePuzzle = () => setSeed(Date.now());
  const handleDownload = async () => {
    setIsDownloading(true);
    try { await downloadWordSearchPdf(worksheetTheme, puzzle, difficulty, paper, includeAnswerKey); }
    finally { setIsDownloading(false); }
  };
  const actionButtons = (mobile = false) => <div className={mobile ? "mt-4 grid grid-cols-2 gap-2 lg:hidden" : "hidden w-[300px] grid-cols-2 gap-2 lg:grid"}>
    <button type="button" disabled={!puzzle.words.length} onClick={shufflePuzzle} className="w-full rounded-xl bg-brand px-3 py-3 text-sm font-bold text-brand-ink transition hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-active focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">Shuffle Puzzle</button>
    <button type="button" disabled={isDownloading || !puzzle.words.length} onClick={handleDownload} className="w-full rounded-xl border border-[#D9D3C8] bg-white px-3 py-3 text-sm font-bold text-chocolate transition hover:bg-[#FAF9F6] disabled:cursor-wait disabled:opacity-55">{isDownloading ? "Creating…" : "Download PDF"}</button>
  </div>;

  return <>
    <section className="mx-auto w-full max-w-[1180px] px-5 pb-16 pt-10 lg:px-10">
      <div className="mb-9 max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-hover">Free printable generator</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight text-chocolate md:text-4xl">{initialThemeSlug ? `${initial.name} Word Search Generator` : "Create Free Printable Word Search Worksheets"}</h1>
        <p className="mt-3 text-base leading-7 text-charcoal/62">{initialThemeSlug && theme.description ? theme.description : "Choose a kid-friendly theme and difficulty, shuffle a fresh puzzle, then download a print-ready worksheet with its answer key."}</p>
      </div>
      <div className="grid items-start gap-7 lg:grid-cols-[360px_1fr]">
        <aside aria-labelledby="word-search-settings" className="rounded-2xl border border-[#E7E2D9] bg-white p-5 shadow-sm">
          <h2 id="word-search-settings" className="mb-5 text-lg font-bold text-chocolate">Create Your Worksheet</h2>
          <label className="block text-sm font-bold text-chocolate" htmlFor="word-search-words">1. Add Your Words</label>
          <div className="mt-3 flex overflow-hidden rounded-xl border border-[#D9D3C8] bg-white transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
            <textarea id="word-search-words" rows={3} value={wordsInput} onChange={(event) => { setWordsInput(event.target.value.toUpperCase().replace(/[^A-Z,，\n ]/g, "")); setWorksheetName("Custom"); }} placeholder={"DOG\nCAT\nFIRE TRUCK"} className="min-w-0 flex-1 resize-none bg-transparent px-3 py-3 text-sm font-semibold uppercase tracking-wide text-chocolate outline-none placeholder:font-normal placeholder:tracking-normal placeholder:text-charcoal/45" />
            <button type="button" aria-label="Choose from word library" title="Choose from word library" onClick={() => setLibraryOpen(true)} className="flex min-h-11 w-24 shrink-0 items-center justify-center gap-1.5 border-l border-[#E4DED4] bg-[#FAF8F4] px-2 text-xs font-bold text-brand-ink transition hover:bg-brand-soft">
              <svg className="size-5" viewBox="0 0 24 24" fill="none" aria-hidden><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8"/><path d="m15.5 15.5 4.25 4.25" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
              Library
            </button>
          </div>
          <p className="mt-2 text-xs leading-5 text-charcoal/65">Enter one word or phrase per line, or separate entries with commas. Spaces are ignored in the puzzle grid.</p>
          {excludedWords.length > 0 && <div aria-live="polite" className="mt-3 rounded-lg border border-[#E8B84A]/45 bg-[#FFF8E5] px-3 py-2 text-xs leading-5 text-[#6B5318]">
            <span className="font-bold">{puzzle.words.length} of {inputWords.length} entries used.</span>
            {tooLongWords.length > 0 && <> {tooLongWords.map((word) => `“${word}”`).join(", ")} {tooLongWords.length === 1 ? "is" : "are"} too long for {difficultyOption.label} (max {difficultyOption.maximumLength} letters).</>}
            {otherExcludedCount > 0 && <> {difficultyOption.label} uses up to {difficultyOption.maximumWords} words, so {otherExcludedCount} more {otherExcludedCount === 1 ? "entry was" : "entries were"} left out.</>}
          </div>}
          <fieldset className="mt-6"><legend className="text-sm font-bold text-chocolate">2. Choose Difficulty</legend>
            <div className="mt-3 grid gap-2">{DIFFICULTY_OPTIONS.map((option) => <button key={option.value} type="button" aria-pressed={difficulty === option.value} onClick={() => setDifficulty(option.value)} className={controlClass(difficulty === option.value)}>
              <span className="text-sm font-bold text-chocolate">{option.label}</span><span className="mt-1 block text-[11px] font-semibold leading-4 text-charcoal/65">{option.detail}</span>
            </button>)}</div>
          </fieldset>
          <fieldset className="mt-6"><legend className="text-sm font-bold text-chocolate">Paper Size</legend><div className="mt-3 grid grid-cols-2 gap-2">{(["letter", "a4"] as PaperSize[]).map((value) => <button key={value} type="button" aria-pressed={paper === value} onClick={() => setPaper(value)} className={`${controlClass(paper === value)} text-center text-sm font-bold text-chocolate`}>{value === "letter" ? "US Letter" : "A4"}</button>)}</div></fieldset>
          <label className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border border-[#E7E2D9] px-3 py-3 text-sm font-semibold text-chocolate"><input type="checkbox" checked={includeAnswerKey} onChange={(event) => setIncludeAnswerKey(event.target.checked)} className="size-4 accent-brand" />Include answer key</label>
        </aside>

        <div>
          <div className="mb-3 flex items-center justify-between gap-4"><p className="text-sm font-bold text-chocolate">Worksheet Preview</p>{actionButtons()}</div>
          <div className="overflow-hidden rounded-2xl border border-[#E7E2D9] bg-[#ECEAE5] p-4 shadow-sm sm:p-7">
            <div className={`mx-auto flex w-full max-w-[680px] flex-col bg-white px-[8%] pb-[5%] pt-[5%] shadow-[0_6px_22px_rgba(61,53,34,0.12)] ${paper === "letter" ? "aspect-[8.5/11]" : "aspect-[210/297]"}`}>
              <div className="flex items-baseline justify-between gap-3"><h2 className="text-sm font-bold text-[#111] sm:text-lg">{worksheetName} Word Search</h2><span className="shrink-0 text-[7px] text-[#555] sm:text-xs">{titleCase(difficulty)} · {puzzle.size}×{puzzle.size}</span></div>
              <div className="mt-[2%] flex items-center gap-2 text-[7px] text-[#333] sm:text-xs"><span className="font-semibold">Name:</span><span className="h-px flex-1 bg-[#777]" /><span className="ml-[4%] font-semibold">Date:</span><span className="h-px w-[24%] bg-[#777]" /></div><p className="mt-[2%] text-[7px] text-[#555] sm:text-[10px]">Find and circle every hidden word.</p>
              <div className="mx-auto mt-[4%] w-[76%]"><WordGrid puzzle={puzzle} /></div>
              <div className="mx-auto mt-[4%] w-[88%]"><p className="text-[7px] font-bold tracking-wide text-[#333] sm:text-[10px]">WORD BANK</p><div className="mt-[2%] grid grid-cols-3 gap-x-3 gap-y-1 font-mono text-[6px] font-semibold text-[#222] sm:text-[9px]">{puzzle.words.map((word) => <span key={word}>{word}</span>)}</div></div>
              <p className="mt-auto pt-[2%] text-center text-[6px] font-semibold tracking-wide text-[#999] sm:text-[9px]">PrintlyKiddo · Learning can be fun</p>
            </div>
          </div>
          {actionButtons(true)}
        </div>
      </div>
    </section>
    {!initialThemeSlug && <section className="border-t border-[#E7E2D9] bg-white/55"><div className="mx-auto w-full max-w-[760px] px-5 py-14 lg:px-10"><h2 className="text-2xl font-bold text-chocolate">A word search made for young learners</h2><p className="mt-3 text-sm leading-7 text-charcoal/62">Beginner puzzles use short words with no backwards spelling. Easy adds diagonals, while Challenge uses longer words and every direction. Type your own words or start with a child-friendly word library.</p></div></section>}
    <WordLibraryModal groups={library} open={libraryOpen} onClose={() => setLibraryOpen(false)} />
  </>;
}
