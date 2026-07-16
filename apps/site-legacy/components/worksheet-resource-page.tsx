"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import { WorksheetImageLightbox } from "@/components/worksheet-image-lightbox";
import {
  WorksheetPdfControls,
  type WorksheetPdfActivity,
  type WorksheetPdfTopic,
} from "@/components/worksheet-pdf-controls";
import { WorksheetPrintListener } from "@/components/worksheet-print-listener";
import type { DownloadHistoryCategory } from "@/lib/download-history";
import type { ActiveSummary, ImgSummary } from "@/lib/d1";

type ActivityImageGroup = {
  active: ActiveSummary;
  imgs: ImgSummary[];
};

type WorksheetResourcePageProps = {
  fileName: string;
  groups: ActivityImageGroup[];
  deferInitialImages?: boolean;
  topicOptions?: WorksheetPdfTopic[];
  initialTopicId?: number | null;
  topicTitle?: string;
  /** 当前类目路径，用于按需 fetch resourceDownloadTopics */
  currentCategoryPath?: string;
  downloadHistoryContext?: {
    level1: DownloadHistoryCategory | null;
    level2: DownloadHistoryCategory | null;
    currentTopic: {
      id: number;
      slug: string;
      title: string;
      url: string;
      thumbnail: string | null;
    };
  };
};

function titleCase(value: string) {
  const text = value.trim();
  if (!text) {
    return text;
  }
  return text
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function isBlankGridCategoryPath(categoryPath?: string) {
  return (
    categoryPath === "puzzles/blank-grids" ||
    categoryPath?.startsWith("puzzles/blank-grids/")
  );
}

function shouldUseTopicActivityTitle(categoryPath?: string) {
  return Boolean(categoryPath && !categoryPath.startsWith("puzzles/"));
}

function buildActivityBaseTitle(active: ActiveSummary, categoryPath?: string) {
  if (active.slug === "puzzle-worksheet" && isBlankGridCategoryPath(categoryPath)) {
    return "Blank Grid Templates";
  }

  const titleBySlug: Record<string, string> = {
    "coloring-pages": "Coloring Pages",
    "tracing-worksheets": "Tracing Worksheets",
    cut: "Scissor Skills Worksheets",
    "number-sequencing": "Number Sequence Puzzles",
    "grid-puzzles": "Grid Puzzles",
    "puzzle-worksheet": "Puzzle Worksheets",
  };

  return titleBySlug[active.slug] ?? titleCase(active.name);
}

function buildActivitySectionTitle(
  active: ActiveSummary,
  categoryPath?: string,
  topicTitle?: string,
) {
  const baseTitle = buildActivityBaseTitle(active, categoryPath);

  if (!topicTitle?.trim() || !shouldUseTopicActivityTitle(categoryPath)) {
    return baseTitle;
  }

  return `${topicTitle.trim()} ${baseTitle}`;
}

function buildActivitySectionDescription(
  active: ActiveSummary,
  categoryPath?: string,
  topicTitle?: string,
) {
  if (!topicTitle?.trim() || !shouldUseTopicActivityTitle(categoryPath)) {
    return null;
  }

  const topic = topicTitle.trim().toLowerCase();
  const descriptionBySlug: Record<string, string> = {
    "coloring-pages": `Choose simple ${topic} coloring pages featuring child-friendly outlines for easy printing and coloring.`,
    "tracing-worksheets": `Trace the ${topic} outlines to practice pencil control, line following, and early fine-motor skills.`,
    cut: `Cut around simple ${topic} shapes for beginner scissor practice and hands-on fine-motor activities.`,
    "number-sequencing": `Follow the number sequence to complete ${topic}-themed printable puzzles for quiet learning and number practice.`,
    "grid-puzzles": `Use the grid to copy and complete ${topic} pictures while practicing visual attention and spatial thinking.`,
  };

  return descriptionBySlug[active.slug] ?? null;
}

const ACTIVITY_DISPLAY_ORDER = [
  "coloring-pages",
  "tracing-worksheets",
  "cut",
  "number-sequencing",
  "grid-puzzles",
  "puzzle-worksheet",
];
const BLACK_WHITE_PDF_ACTIVITY_SLUGS = new Set([
  "coloring-pages",
  "tracing-worksheets",
  "puzzle-worksheet",
]);

function getActivityDisplayIndex(group: ActivityImageGroup) {
  const index = ACTIVITY_DISPLAY_ORDER.indexOf(group.active.slug);
  return index === -1 ? ACTIVITY_DISPLAY_ORDER.length : index;
}

function getImageLoading(index: number, deferInitialImages: boolean): "eager" | "lazy" {
  return !deferInitialImages && index < 4 ? "eager" : "lazy";
}

function buildWorksheetPdfActivities(
  groups: ActivityImageGroup[],
  categoryPath?: string,
  topicTitle?: string,
): WorksheetPdfActivity[] {
  return groups.map((group) => ({
    slug: group.active.slug,
    label: buildActivitySectionTitle(group.active, categoryPath, topicTitle),
    imageUrls: group.imgs.map((item) => item.imageUrl),
    items: group.imgs.map((item) => ({
      imageUrl: item.imageUrl,
      answerImageUrl: item.answerImageUrl,
      title: item.title,
      difficulty: item.difficulty,
    })),
    grayscale: BLACK_WHITE_PDF_ACTIVITY_SLUGS.has(group.active.slug),
  }));
}

const WORKSHEET_TILE_SIZES =
  "(min-width: 1024px) 280px, (min-width: 640px) 45vw, 50vw";

const DIFFICULTY_LABEL_BY_VALUE: Record<number, string> = {
  1: "Easy",
  2: "Medium",
  3: "Hard",
};

const DIFFICULTY_VALUES = [1, 2, 3] as const;

export function WorksheetResourcePage({
  fileName,
  groups,
  deferInitialImages = false,
  topicOptions,
  initialTopicId = null,
  topicTitle,
  currentCategoryPath,
  downloadHistoryContext,
}: WorksheetResourcePageProps) {
  const sortedGroups = [...groups].sort(
    (a, b) => getActivityDisplayIndex(a) - getActivityDisplayIndex(b),
  );
  const pdfActivities = buildWorksheetPdfActivities(
    sortedGroups,
    currentCategoryPath,
    topicTitle,
  );
  const puzzleDifficulties = useMemo(
    () =>
      DIFFICULTY_VALUES.filter((value) =>
        sortedGroups.some(
          (group) =>
            group.active.slug === "puzzle-worksheet" &&
            group.imgs.some((item) => item.difficulty === value),
        ),
      ),
    [sortedGroups],
  );
  const [selectedPuzzleDifficulty, setSelectedPuzzleDifficulty] = useState<
    number | null
  >(puzzleDifficulties[0] ?? null);
  const effectivePuzzleDifficulty =
    selectedPuzzleDifficulty !== null &&
    puzzleDifficulties.includes(selectedPuzzleDifficulty as 1 | 2 | 3)
      ? selectedPuzzleDifficulty
      : (puzzleDifficulties[0] ?? null);
  let imageIndex = 0;

  return (
    <div className="mx-auto max-w-[1280px]">
      <WorksheetImageLightbox />
      <WorksheetPrintListener />
      <WorksheetPdfControls
        fileName={fileName}
        activities={pdfActivities}
        topicTitle={topicTitle}
        topicOptions={topicOptions}
        initialTopicId={initialTopicId}
        currentCategoryPath={currentCategoryPath}
        hideActivityChart={currentCategoryPath?.startsWith("puzzles/") ?? false}
        downloadHistoryContext={downloadHistoryContext}
      />

      <section className="mt-12 border-t border-[#EEE8DD] pb-20 pt-8">
        <div className="space-y-10">
          {sortedGroups.map((group) => {
            const isPuzzleWorksheet = group.active.slug === "puzzle-worksheet";
            const shouldShowDifficultyTabs =
              isPuzzleWorksheet && puzzleDifficulties.length > 0;
            const visibleImgs =
              shouldShowDifficultyTabs && effectivePuzzleDifficulty !== null
                ? group.imgs.filter(
                    (item) => item.difficulty === effectivePuzzleDifficulty,
                  )
                : group.imgs;
            const sectionDescription = buildActivitySectionDescription(
              group.active,
              currentCategoryPath,
              topicTitle,
            );

            return (
              <section key={group.active.slug}>
                <h2 className="mb-2 text-xl font-bold leading-[1.2] text-[#3B352C]">
                  {buildActivitySectionTitle(
                    group.active,
                    currentCategoryPath,
                    topicTitle,
                  )}
                </h2>
                {sectionDescription ? (
                  <p className="mb-4 max-w-[68ch] text-sm leading-6 text-warm-ink/65">
                    {sectionDescription}
                  </p>
                ) : null}
                {shouldShowDifficultyTabs ? (
                  <div
                    className="mb-5 flex flex-wrap gap-2"
                    role="tablist"
                    aria-label="Puzzle difficulty"
                  >
                    {puzzleDifficulties.map((difficulty) => {
                      const selected = effectivePuzzleDifficulty === difficulty;
                      return (
                        <button
                          key={difficulty}
                          type="button"
                          role="tab"
                          aria-selected={selected}
                          className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                            selected
                              ? "border-[#3B352C] bg-[#3B352C] text-white"
                              : "border-[#EEE8DD] bg-white text-[#3B352C] hover:border-[#3B352C]"
                          }`}
                          onClick={() => setSelectedPuzzleDifficulty(difficulty)}
                        >
                          {DIFFICULTY_LABEL_BY_VALUE[difficulty]}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
                  {visibleImgs.map((item) => {
                    const currentImageIndex = imageIndex;
                    imageIndex += 1;
                    const loading = getImageLoading(
                      currentImageIndex,
                      deferInitialImages,
                    );
                    const isLcpCandidate =
                      !deferInitialImages && currentImageIndex === 0;

                    return (
                      <article
                        key={item.id}
                        className="relative overflow-hidden rounded-[18px] border border-[#eee8dd] bg-white"
                      >
                        <button
                          type="button"
                          aria-label={`Print ${item.title}`}
                          data-print-image={item.imageUrl}
                          data-print-title={item.title}
                          className="absolute right-3 top-3 z-10 rounded-lg border border-brand bg-brand p-2 text-brand-ink shadow-sm transition-colors duration-200 hover:border-brand-hover hover:bg-brand-hover active:border-brand-active active:bg-brand-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                        >
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="h-4 w-4 text-current"
                            aria-hidden
                          >
                            <path d="M6 9V2h12v7" />
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                            <path d="M6 14h12v8H6z" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="block w-full cursor-zoom-in text-left"
                          data-worksheet-preview-src={item.cardImageUrl}
                          data-worksheet-preview-title={item.title}
                          aria-label={`Enlarge ${item.title}`}
                        >
                          <div className="aspect-square bg-white p-5 sm:p-6">
                            <div className="relative h-full w-full bg-white">
                              <Image
                                src={item.cardImageUrl}
                                alt={item.title}
                                fill
                                sizes={WORKSHEET_TILE_SIZES}
                                loading={loading}
                                priority={isLcpCandidate}
                                fetchPriority={isLcpCandidate ? "high" : undefined}
                                className="object-contain"
                              />
                            </div>
                          </div>
                        </button>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </section>
    </div>
  );
}
