"use client";

import { useEffect, useMemo, useState } from "react";

import {
  downloadImagePdfSets,
  downloadPuzzleWorksheetPdf,
  type PdfPaperSize,
} from "@/lib/print-image";
import {
  recordDownloadHistory,
  type DownloadHistoryCategory,
  type DownloadHistoryInput,
} from "@/lib/download-history";

export type PdfLayout = "full-page" | "two-per-page";
export type PuzzlePdfLayout = 1 | 2 | 4;

export type WorksheetPdfImageItem = {
  imageUrl: string;
  answerImageUrl?: string | null;
  title?: string | null;
  difficulty?: number | null;
};

export type WorksheetPdfActivity = {
  slug: string;
  label: string;
  imageUrls: string[];
  items?: WorksheetPdfImageItem[];
  grayscale?: boolean;
};

export type WorksheetPdfTopic = {
  id: number;
  slug?: string;
  title: string;
  coverImageUrl: string | null;
  activities: WorksheetPdfActivity[];
};

type WorksheetPdfControlsModalProps = {
  fileName: string;
  activities: WorksheetPdfActivity[];
  topicOptions?: WorksheetPdfTopic[];
  initialTopicId?: number | null;
  /** 资源页：弹框打开后读取构建期生成的兄弟 topic + 图片清单。 */
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
  isDownloading: boolean;
  setIsDownloading: (value: boolean) => void;
  onClose: () => void;
};

const PUZZLE_WORKSHEET_SLUG = "puzzle-worksheet";
const DIFFICULTY_VALUES = [1, 2, 3] as const;
const DIFFICULTY_LABEL_BY_VALUE: Record<(typeof DIFFICULTY_VALUES)[number], string> = {
  1: "Easy",
  2: "Medium",
  3: "Hard",
};

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function getImagesPerPage(layout: PdfLayout): 1 | 2 {
  return layout === "two-per-page" ? 2 : 1;
}

function appendPdfFileNameSuffix(fileName: string, suffix: string) {
  const trimmed = fileName.trim();
  if (!trimmed) {
    return suffix;
  }

  return trimmed.replace(/(?:\.pdf)?$/i, `-${suffix}.pdf`);
}

function getCompactActivityLabel(activity: WorksheetPdfActivity) {
  const labelsBySlug: Record<string, string> = {
    "coloring-pages": "Coloring",
    "tracing-worksheets": "Tracing",
    cut: "Cut",
    "number-sequencing": "Number",
    "grid-puzzles": "Grid",
    "puzzle-worksheet": "Puzzle",
  };

  return labelsBySlug[activity.slug] ?? activity.label;
}

function getActivityItems(activity: WorksheetPdfActivity): WorksheetPdfImageItem[] {
  if (activity.items?.length) {
    return activity.items;
  }
  return activity.imageUrls.map((imageUrl) => ({ imageUrl }));
}

function isPuzzleActivity(activity: WorksheetPdfActivity) {
  return activity.slug === PUZZLE_WORKSHEET_SLUG;
}

function PuzzleLayoutIcon({ value }: { value: PuzzlePdfLayout }) {
  const cells = value === 4 ? 4 : value === 2 ? 2 : 1;
  return (
    <span
      className={`grid h-12 w-12 gap-1 rounded-[10px] border border-[#D9D0C3] bg-white p-1.5 ${
        value === 4 ? "grid-cols-2" : "grid-cols-1"
      }`}
      aria-hidden
    >
      {Array.from({ length: cells }, (_, index) => (
        <span
          key={index}
          className="rounded-[4px] border border-[#8F887C] bg-[#FBFAF7]"
        />
      ))}
    </span>
  );
}

function buildDownloadSets(
  fileName: string,
  selectedActivities: WorksheetPdfActivity[],
) {
  const blackWhiteImageUrls = selectedActivities
    .filter((activity) => activity.grayscale && !isPuzzleActivity(activity))
    .flatMap((activity) => activity.imageUrls);
  const colorImageUrls = selectedActivities
    .filter((activity) => !activity.grayscale && !isPuzzleActivity(activity))
    .flatMap((activity) => activity.imageUrls);

  return [
    {
      fileName: appendPdfFileNameSuffix(fileName, "black-white"),
      imageUrls: blackWhiteImageUrls,
      grayscale: true,
    },
    {
      fileName: appendPdfFileNameSuffix(fileName, "color"),
      imageUrls: colorImageUrls,
    },
  ].filter((set) => set.imageUrls.length > 0);
}

function buildDownloadSummary(selectedActivities: WorksheetPdfActivity[]) {
  const blackWhitePageCount = selectedActivities
    .filter((activity) => activity.grayscale && !isPuzzleActivity(activity))
    .reduce((sum, activity) => sum + activity.imageUrls.length, 0);
  const colorPageCount = selectedActivities
    .filter((activity) => !activity.grayscale && !isPuzzleActivity(activity))
    .reduce((sum, activity) => sum + activity.imageUrls.length, 0);
  const puzzleCount = selectedActivities
    .filter(isPuzzleActivity)
    .reduce((sum, activity) => sum + getActivityItems(activity).length, 0);
  const totalPageCount = blackWhitePageCount + colorPageCount + puzzleCount;

  if (totalPageCount === 0) {
    return "Select at least one activity to generate a PDF.";
  }

  if (puzzleCount > 0 && blackWhitePageCount === 0 && colorPageCount === 0) {
    return `${puzzleCount} puzzles selected. This will download 1 puzzle worksheet PDF.`;
  }

  if (blackWhitePageCount > 0 && colorPageCount > 0) {
    return `${totalPageCount} pages selected. This will download 2 PDFs: black & white (${blackWhitePageCount} pages) and color (${colorPageCount} pages).`;
  }

  if (blackWhitePageCount > 0) {
    return `${blackWhitePageCount} pages selected. This will download 1 black & white PDF.`;
  }

  return `${colorPageCount} pages selected. This will download 1 color PDF.`;
}

function getInitialTopicIds(
  topicOptions: WorksheetPdfTopic[] | undefined,
  initialTopicId: number | null | undefined,
) {
  if (!topicOptions?.length) {
    return [];
  }

  if (initialTopicId && topicOptions.some((topic) => topic.id === initialTopicId)) {
    return [initialTopicId];
  }

  return [topicOptions[0].id];
}

function buildAvailableActivities(
  topicOptions: WorksheetPdfTopic[] | undefined,
  fallbackActivities: WorksheetPdfActivity[],
) {
  if (!topicOptions?.length) {
    return fallbackActivities.filter((activity) => activity.imageUrls.length > 0);
  }

  const bySlug = new Map<string, WorksheetPdfActivity>();
  for (const topic of topicOptions) {
    for (const activity of topic.activities) {
      if (!bySlug.has(activity.slug)) {
        bySlug.set(activity.slug, {
          slug: activity.slug,
          label: activity.label,
          imageUrls: [],
          grayscale: activity.grayscale,
        });
      }
    }
  }

  return [...bySlug.values()];
}

function buildSelectedActivities(
  availableActivities: WorksheetPdfActivity[],
  selectedActivitySlugs: string[],
  selectedTopics: WorksheetPdfTopic[],
  useTopicOptions: boolean,
) {
  if (!useTopicOptions) {
    return availableActivities.filter((activity) =>
      selectedActivitySlugs.includes(activity.slug),
    );
  }

  if (selectedTopics.length === 0) {
    return [];
  }

  return availableActivities
    .filter((activity) => selectedActivitySlugs.includes(activity.slug))
    .map((activity) => {
      const selectedTopicActivities = selectedTopics
        .map((topic) =>
          topic.activities.find((item) => item.slug === activity.slug),
        )
        .filter((item): item is WorksheetPdfActivity => Boolean(item));
      const items = selectedTopicActivities.flatMap(getActivityItems);

      return {
        ...activity,
        imageUrls: items.map((item) => item.imageUrl),
        items,
      };
    })
    .filter((activity) => activity.imageUrls.length > 0);
}

function getPuzzleDifficulties(activities: WorksheetPdfActivity[]) {
  return DIFFICULTY_VALUES.filter((difficulty) =>
    activities.some(
      (activity) =>
        isPuzzleActivity(activity) &&
        getActivityItems(activity).some((item) => item.difficulty === difficulty),
    ),
  );
}

function buildDownloadHistoryInputs({
  selectedActivities,
  selectedTopics,
  hasTopicOptions,
  context,
}: {
  selectedActivities: WorksheetPdfActivity[];
  selectedTopics: WorksheetPdfTopic[];
  hasTopicOptions: boolean;
  context: WorksheetPdfControlsModalProps["downloadHistoryContext"];
}): DownloadHistoryInput[] {
  if (!context) {
    return [];
  }

  const activitySlugs = selectedActivities.map((activity) => activity.slug);
  const isPuzzleWorksheetDownload = selectedActivities.some(isPuzzleActivity);
  const activityLabels = selectedActivities.flatMap((activity) =>
    isPuzzleActivity(activity)
      ? getPuzzleDifficulties([activity]).map(
          (difficulty) => DIFFICULTY_LABEL_BY_VALUE[difficulty],
        )
      : [getCompactActivityLabel(activity)],
  );

  const topics = hasTopicOptions
    ? selectedTopics
    : [
        {
          id: context.currentTopic.id,
          slug: context.currentTopic.slug,
          title: context.currentTopic.title,
          coverImageUrl: context.currentTopic.thumbnail,
          activities: selectedActivities,
        },
      ];

  const inputs: DownloadHistoryInput[] = [];

  for (const topic of topics) {
    const slug =
      topic.slug ??
      (topic.id === context.currentTopic.id ? context.currentTopic.slug : "");
    const url =
      topic.id === context.currentTopic.id
        ? context.currentTopic.url
        : context.level1 && context.level2 && slug
          ? `/${context.level1.slug}/${context.level2.slug}/${slug}`
          : "";

    if (!url) {
      continue;
    }

    inputs.push({
      id: topic.id,
      name: topic.title,
      url,
      thumbnail: topic.coverImageUrl ?? null,
      thumbnailAlt: `${topic.title} printable preview`,
      level1: context.level1,
      level2: context.level2,
      activitySlugs,
      activityLabels,
      replaceActivityMetadata: isPuzzleWorksheetDownload,
    });
  }

  return inputs;
}

function filterPuzzleActivitiesByDifficulty(
  activities: WorksheetPdfActivity[],
  selectedDifficulties: number[],
) {
  return activities
    .map((activity) => {
      if (!isPuzzleActivity(activity)) {
        return activity;
      }

      const allItems = getActivityItems(activity);
      const hasDifficultyItems = allItems.some((item) =>
        DIFFICULTY_VALUES.includes(item.difficulty as (typeof DIFFICULTY_VALUES)[number]),
      );

      if (!hasDifficultyItems) {
        return activity;
      }

      const items = allItems.filter(
        (item) => item.difficulty !== null && item.difficulty !== undefined && selectedDifficulties.includes(item.difficulty),
      );

      return {
        ...activity,
        imageUrls: items.map((item) => item.imageUrl),
        items,
      };
    })
    .filter((activity) => !isPuzzleActivity(activity) || activity.imageUrls.length > 0);
}

export default function WorksheetPdfControlsModal({
  fileName,
  activities,
  topicOptions: topicOptionsProp,
  initialTopicId = null,
  currentCategoryPath,
  downloadHistoryContext,
  isDownloading,
  setIsDownloading,
  onClose,
}: WorksheetPdfControlsModalProps) {
  const [layout, setLayout] = useState<PdfLayout>("full-page");
  const [paperSize, setPaperSize] = useState<PdfPaperSize>("a4");
  const [puzzleLayout, setPuzzleLayout] = useState<PuzzlePdfLayout>(4);
  const [showPuzzleNameDate, setShowPuzzleNameDate] = useState(true);
  const [includePuzzleAnswerKey, setIncludePuzzleAnswerKey] = useState(false);
  const [selectedPuzzleDifficulties, setSelectedPuzzleDifficulties] = useState<
    number[]
  >(() => [...DIFFICULTY_VALUES]);
  const [fetchedTopics, setFetchedTopics] = useState<
    WorksheetPdfTopic[] | null
  >(null);
  const [isLoadingTopics, setIsLoadingTopics] = useState(false);
  const topicOptions = topicOptionsProp ?? fetchedTopics ?? undefined;
  const hasTopicOptions = Boolean(topicOptions?.length);
  const shouldFetchTopics =
    !topicOptionsProp && Boolean(currentCategoryPath) && fetchedTopics === null;

  // 清理旧版本遗留在本机的 PDF 配置项（现在不再持久化这些设置）。
  useEffect(() => {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    for (const key of [
      "printlykiddo.layout",
      "printlykiddo.paperSize",
      "printlykiddo.puzzleLayout",
      "printlykiddo.puzzleNameDate",
      "printlykiddo.puzzleAnswerKey",
    ]) {
      window.localStorage.removeItem(key);
    }
  }, []);

  useEffect(() => {
    if (!shouldFetchTopics || !currentCategoryPath) {
      return;
    }
    let cancelled = false;
    setIsLoadingTopics(true);
    const normalizedPath = currentCategoryPath
      .split("/")
      .filter(Boolean)
      .map(encodeURIComponent)
      .join("/");
    const topicsUrl = process.env.NODE_ENV === "development"
      ? `/api/pdf-topics?path=${encodeURIComponent(currentCategoryPath)}`
      : `/data/pdf-topics/${normalizedPath}.json`;
    fetch(topicsUrl, { cache: process.env.NODE_ENV === "development" ? "no-store" : "force-cache" })
      .then((res) => (res.ok ? res.json() : { topics: [] }))
      .then((data: { topics?: WorksheetPdfTopic[] }) => {
        if (!cancelled) {
          setFetchedTopics(data.topics ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFetchedTopics([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingTopics(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [shouldFetchTopics, currentCategoryPath]);

  const [selectedTopicIds, setSelectedTopicIds] = useState<number[]>(() =>
    getInitialTopicIds(topicOptions, initialTopicId),
  );
  const availableActivities = useMemo(
    () => buildAvailableActivities(topicOptions, activities),
    [activities, topicOptions],
  );
  const [selectedActivitySlugs, setSelectedActivitySlugs] = useState<string[]>(
    () => availableActivities.map((activity) => activity.slug),
  );
  const selectedTopics = useMemo(
    () =>
      hasTopicOptions
        ? (topicOptions ?? []).filter((topic) => selectedTopicIds.includes(topic.id))
        : [],
    [hasTopicOptions, selectedTopicIds, topicOptions],
  );
  const selectedActivitiesBeforeDifficulty = useMemo(
    () =>
      buildSelectedActivities(
        availableActivities,
        selectedActivitySlugs,
        selectedTopics,
        hasTopicOptions,
      ),
    [availableActivities, hasTopicOptions, selectedActivitySlugs, selectedTopics],
  );
  const availablePuzzleDifficulties = useMemo(
    () => getPuzzleDifficulties(selectedActivitiesBeforeDifficulty),
    [selectedActivitiesBeforeDifficulty],
  );
  const shouldShowPuzzleDifficultyControl = availablePuzzleDifficulties.length > 0;
  const selectedActivities = useMemo(
    () =>
      shouldShowPuzzleDifficultyControl
        ? filterPuzzleActivitiesByDifficulty(
            selectedActivitiesBeforeDifficulty,
            selectedPuzzleDifficulties,
          )
        : selectedActivitiesBeforeDifficulty,
    [
      selectedActivitiesBeforeDifficulty,
      selectedPuzzleDifficulties,
      shouldShowPuzzleDifficultyControl,
    ],
  );
  const selectedImageCount = selectedActivities.reduce(
    (sum, activity) => sum + activity.imageUrls.length,
    0,
  );
  const selectedPuzzleActivities = selectedActivities.filter(isPuzzleActivity);
  const selectedPuzzleItems = selectedPuzzleActivities.flatMap(getActivityItems);
  const selectedPuzzleItemsBeforeDifficulty = selectedActivitiesBeforeDifficulty
    .filter(isPuzzleActivity)
    .flatMap(getActivityItems);
  const selectedPuzzleAnswerCount = selectedPuzzleItems.filter(
    (item) => item.answerImageUrl,
  ).length;
  const hasSelectedPuzzleActivities = selectedPuzzleItemsBeforeDifficulty.length > 0;
  const downloadSummary = buildDownloadSummary(selectedActivities);
  const allTopicsSelected =
    hasTopicOptions &&
    Boolean(topicOptions?.length) &&
    selectedTopicIds.length === topicOptions?.length;
  const allActivitiesSelected =
    availableActivities.length > 0 &&
    selectedActivities.length === availableActivities.length;
  const isPuzzleOnlyDownload =
    availableActivities.length > 0 && availableActivities.every(isPuzzleActivity);

  useEffect(() => {
    setSelectedActivitySlugs(availableActivities.map((activity) => activity.slug));
  }, [availableActivities]);

  useEffect(() => {
    setSelectedTopicIds(getInitialTopicIds(topicOptions, initialTopicId));
  }, [initialTopicId, topicOptions]);

  useEffect(() => {
    setSelectedPuzzleDifficulties((current) => {
      if (availablePuzzleDifficulties.length === 0) {
        return [];
      }
      const next = current.filter((difficulty) =>
        availablePuzzleDifficulties.includes(
          difficulty as (typeof DIFFICULTY_VALUES)[number],
        ),
      );
      return next.length > 0 ? next : [...availablePuzzleDifficulties];
    });
  }, [availablePuzzleDifficulties]);

  function toggleActivity(slug: string) {
    setSelectedActivitySlugs((current) => {
      if (current.includes(slug)) {
        return current.filter((item) => item !== slug);
      }
      return [...current, slug];
    });
  }

  function selectAllActivities() {
    setSelectedActivitySlugs(availableActivities.map((activity) => activity.slug));
  }

  function clearActivities() {
    setSelectedActivitySlugs([]);
  }

  function toggleTopic(topicId: number) {
    setSelectedTopicIds((current) => {
      if (current.includes(topicId)) {
        return current.filter((item) => item !== topicId);
      }
      return [...current, topicId];
    });
  }

  function selectAllTopics() {
    setSelectedTopicIds((topicOptions ?? []).map((topic) => topic.id));
  }

  function clearTopics() {
    setSelectedTopicIds([]);
  }

  function togglePuzzleDifficulty(difficulty: number) {
    setSelectedPuzzleDifficulties((current) => {
      if (current.includes(difficulty)) {
        return current.filter((item) => item !== difficulty);
      }
      return [...current, difficulty].sort((a, b) => a - b);
    });
  }

  async function handleDownload() {
    const downloadSets = buildDownloadSets(fileName, selectedActivities);
    const puzzleItems = selectedActivities
      .filter(isPuzzleActivity)
      .flatMap(getActivityItems);

    if (
      (downloadSets.length === 0 && puzzleItems.length === 0) ||
      isDownloading ||
      (!isPuzzleOnlyDownload && hasTopicOptions && selectedTopics.length === 0)
    ) {
      return;
    }

    setIsDownloading(true);
    try {
      if (downloadSets.length > 0) {
        await downloadImagePdfSets(
          downloadSets.map((set) => ({
            urls: set.imageUrls,
            fileName: set.fileName,
            grayscale: set.grayscale,
            imagesPerPage: getImagesPerPage(layout),
            paperSize,
          })),
        );
      }
      if (puzzleItems.length > 0) {
        await downloadPuzzleWorksheetPdf({
          items: puzzleItems.map((item) => ({
            imageUrl: item.imageUrl,
            answerImageUrl: item.answerImageUrl ?? null,
            title: item.title ?? null,
          })),
          fileName: appendPdfFileNameSuffix(fileName, "puzzles"),
          paperSize,
          puzzlesPerPage: puzzleLayout,
          showNameDate: showPuzzleNameDate,
          includeAnswerKey: includePuzzleAnswerKey,
        });
      }
      recordDownloadHistory(
        buildDownloadHistoryInputs({
          selectedActivities,
          selectedTopics,
          hasTopicOptions,
          context: downloadHistoryContext,
        }),
      );
      onClose();
    } catch (error) {
      console.error(error);
      window.alert("Failed to generate the PDF. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6">
      <div
        className="max-h-[calc(100vh-48px)] w-[calc(100vw-32px)] max-w-[560px] overflow-y-auto rounded-[20px] bg-white p-5 shadow-[0_24px_80px_rgba(59,53,44,0.18)] sm:p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="worksheet-pdf-options-title"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="worksheet-pdf-options-title"
              className="m-0 text-[22px] font-bold leading-[1.2] text-[#3B352C]"
            >
              Print options
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#8F887C]">
              Set up this PDF download before printing.
            </p>
          </div>

          <button
            type="button"
            className="rounded-full border-0 bg-[#F7F1E7] px-3 py-1.5 text-sm font-semibold text-[#6F685D] transition hover:bg-[#EEE8DD] disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => !isDownloading && onClose()}
            disabled={isDownloading}
          >
            Close
          </button>
        </div>

        {!isPuzzleOnlyDownload && hasTopicOptions ? (
          <fieldset className="mt-5 border-0 p-0">
            <div className="flex items-center justify-between gap-3">
              <legend className="text-sm font-bold text-[#3B352C]">
                Topics
              </legend>
              <div className="flex items-center gap-2 text-xs font-semibold text-[#8F887C]">
                <span>
                  {selectedTopicIds.length}/{topicOptions?.length ?? 0} selected
                </span>
                <span aria-hidden>·</span>
                <button
                  type="button"
                  className="border-0 bg-transparent p-0 font-semibold text-[#8F887C]"
                  onClick={allTopicsSelected ? clearTopics : selectAllTopics}
                >
                  {allTopicsSelected ? "Clear" : "Select all"}
                </button>
              </div>
            </div>

            <div className="mt-3 grid max-h-[152px] grid-cols-2 gap-2 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-3">
              {(topicOptions ?? []).map((topic) => {
                const isSelected = selectedTopicIds.includes(topic.id);

                return (
                  <button
                    key={topic.id}
                    type="button"
                    className={`flex min-w-0 items-center gap-2 rounded-[12px] border-2 px-2 py-1.5 text-left ${isSelected ? "border-brand bg-brand-soft" : "border-[#E8E2D8] bg-white"}`}
                    onClick={() => toggleTopic(topic.id)}
                    aria-pressed={isSelected}
                  >
                    {topic.coverImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={topic.coverImageUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-12 w-12 shrink-0 rounded-md border border-[#EEE8DD] bg-white object-contain p-0.5"
                      />
                    ) : null}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-[#3B352C]">
                        {topic.title}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : isLoadingTopics ? (
          <div className="mt-5 rounded-[14px] bg-[#F8F3EA] px-4 py-3 text-xs leading-5 text-[#6F685D]">
            Loading available topics…
          </div>
        ) : null}

        {!isPuzzleOnlyDownload ? (
          <fieldset className="mt-6 border-0 p-0">
          <div className="flex items-center justify-between gap-3">
            <legend className="text-sm font-bold text-[#3B352C]">Content</legend>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#8F887C]">
              <span>
                {selectedActivitySlugs.length}/{availableActivities.length} selected
              </span>
              <span aria-hidden>·</span>
              <button
                type="button"
                className="border-0 bg-transparent p-0 font-semibold text-[#8F887C]"
                onClick={
                  allActivitiesSelected ? clearActivities : selectAllActivities
                }
              >
                {allActivitiesSelected ? "Clear" : "Select all"}
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {availableActivities.map((activity) => {
              const isSelected = selectedActivitySlugs.includes(activity.slug);

              return (
                <label
                  key={activity.slug}
                  className={`min-w-[112px] cursor-pointer rounded-full border-2 px-4 py-2 text-center text-sm font-semibold text-[#3B352C] sm:min-w-[124px] ${isSelected ? "border-brand bg-brand-soft" : "border-[#E8E2D8] bg-white"}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isSelected}
                    onChange={() => toggleActivity(activity.slug)}
                  />
                  {getCompactActivityLabel(activity)}
                </label>
              );
            })}
          </div>
          </fieldset>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <fieldset className="min-w-0 border-0 p-0">
            <legend className="mb-2 text-sm font-bold text-[#3B352C]">Paper</legend>
            <div className="grid grid-cols-2 rounded-[14px] bg-[#F7F1E7] p-1">
              <button
                type="button"
                className={`rounded-[10px] px-3 py-2 text-sm font-bold transition ${paperSize === "a4" ? "bg-white text-[#3B352C] shadow-[0_4px_14px_rgba(59,53,44,0.08)]" : "text-[#8F887C] hover:text-[#3B352C]"}`}
                onClick={() => setPaperSize("a4")}
                aria-pressed={paperSize === "a4"}
              >
                A4
              </button>
              <button
                type="button"
                className={`rounded-[10px] px-3 py-2 text-sm font-bold transition ${paperSize === "letter" ? "bg-white text-[#3B352C] shadow-[0_4px_14px_rgba(59,53,44,0.08)]" : "text-[#8F887C] hover:text-[#3B352C]"}`}
                onClick={() => setPaperSize("letter")}
                aria-pressed={paperSize === "letter"}
              >
                Letter
              </button>
            </div>
          </fieldset>

          {!hasSelectedPuzzleActivities ? (
            <fieldset className="min-w-0 border-0 p-0">
            <legend className="mb-2 text-sm font-bold text-[#3B352C]">Layout</legend>
            <div className="grid grid-cols-2 rounded-[14px] bg-[#F7F1E7] p-1">
              <button
                type="button"
                className={`rounded-[10px] px-2 py-2 text-sm font-bold transition ${layout === "full-page" ? "bg-white text-[#3B352C] shadow-[0_4px_14px_rgba(59,53,44,0.08)]" : "text-[#8F887C] hover:text-[#3B352C]"}`}
                onClick={() => setLayout("full-page")}
                aria-pressed={layout === "full-page"}
              >
                1/page
              </button>
              <button
                type="button"
                className={`rounded-[10px] px-2 py-2 text-sm font-bold transition ${layout === "two-per-page" ? "bg-white text-[#3B352C] shadow-[0_4px_14px_rgba(59,53,44,0.08)]" : "text-[#8F887C] hover:text-[#3B352C]"}`}
                onClick={() => setLayout("two-per-page")}
                aria-pressed={layout === "two-per-page"}
              >
                2/page
              </button>
            </div>
            </fieldset>
          ) : null}
        </div>

        {hasSelectedPuzzleActivities ? (
          <fieldset className="mt-5 border-0 p-0">
            <legend className="mb-2 text-sm font-bold text-[#3B352C]">
              Puzzle layout
            </legend>
            <div className="grid grid-cols-3 gap-3">
              {([4, 2, 1] as PuzzlePdfLayout[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={`flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-[14px] border-2 px-3 py-3 text-sm font-bold transition ${
                    puzzleLayout === value
                      ? "border-brand bg-brand-soft text-[#3B352C]"
                      : "border-[#E8E2D8] bg-white text-[#8F887C] hover:text-[#3B352C]"
                  }`}
                  onClick={() => setPuzzleLayout(value)}
                  aria-pressed={puzzleLayout === value}
                >
                  <PuzzleLayoutIcon value={value} />
                  <span>{value}/page</span>
                </button>
              ))}
            </div>
            {shouldShowPuzzleDifficultyControl ? (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-[#3B352C]">
                    Difficulty
                  </span>
                  <span className="text-xs font-semibold text-[#8F887C]">
                    {selectedPuzzleDifficulties.length}/
                    {availablePuzzleDifficulties.length} selected
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {availablePuzzleDifficulties.map((difficulty) => {
                    const isSelected = selectedPuzzleDifficulties.includes(difficulty);

                    return (
                      <label
                        key={difficulty}
                        className={`min-w-[96px] cursor-pointer rounded-full border-2 px-4 py-2 text-center text-sm font-semibold text-[#3B352C] ${
                          isSelected
                            ? "border-brand bg-brand-soft"
                            : "border-[#E8E2D8] bg-white"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={isSelected}
                          onChange={() => togglePuzzleDifficulty(difficulty)}
                        />
                        {DIFFICULTY_LABEL_BY_VALUE[difficulty]}
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[14px] border border-[#E8E2D8] bg-white px-4 py-3 text-sm font-semibold text-[#3B352C]">
                <span>Show Name / Date</span>
                <input
                  type="checkbox"
                  checked={showPuzzleNameDate}
                  onChange={(event) => setShowPuzzleNameDate(event.target.checked)}
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[14px] border border-[#E8E2D8] bg-white px-4 py-3 text-sm font-semibold text-[#3B352C]">
                <span>Include answer key</span>
                <input
                  type="checkbox"
                  checked={includePuzzleAnswerKey}
                  onChange={(event) => setIncludePuzzleAnswerKey(event.target.checked)}
                />
              </label>
            </div>
            {selectedPuzzleAnswerCount === 0 ? (
              <p className="mt-2 text-xs leading-5 text-[#8F887C]">
                No answer images are available for the selected puzzles yet.
              </p>
            ) : null}
          </fieldset>
        ) : null}

        <div className="mt-5 rounded-[14px] bg-[#F8F3EA] px-4 py-3 text-xs leading-5 text-[#6F685D]">
          {downloadSummary}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="w-full border-0 bg-transparent px-4 py-3 text-sm font-medium text-[#8F887C] transition hover:text-[#3B352C] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
            onClick={() => !isDownloading && onClose()}
            disabled={isDownloading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-[14px] border-0 bg-brand px-5 py-3 text-sm font-bold text-brand-ink transition-colors enabled:hover:bg-brand-hover enabled:active:bg-brand-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45 disabled:cursor-not-allowed disabled:bg-brand-disabled sm:w-auto"
            onClick={handleDownload}
            disabled={
              isDownloading ||
              isLoadingTopics ||
              selectedImageCount === 0 ||
              (!isPuzzleOnlyDownload && hasTopicOptions && selectedTopics.length === 0)
            }
          >
            <DownloadIcon className="h-4 w-4" />
            {isDownloading ? "Generating..." : "Generate PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}
