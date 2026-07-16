"use client";

import { useMemo, useState } from "react";

import {
  downloadProgressTrackerPdf,
  type PdfPaperSize,
  type ProgressTrackerStyle,
} from "@/lib/print-image";

type ProgressTrackerActivity = {
  slug: string;
  label: string;
  imageUrls: string[];
};

type WorksheetProgressTrackerControlsProps = {
  topicTitle?: string;
  fileName: string;
  activities: ProgressTrackerActivity[];
};

const MAX_TRACKER_COUNT = 40;

function TrackerIcon({ className }: { className?: string }) {
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
      <path d="M9 11l2 2 4-4" />
      <path d="M8 4h8" />
      <path d="M7 4h10a2 2 0 0 1 2 2v14H5V6a2 2 0 0 1 2-2z" />
    </svg>
  );
}

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

function StylePreviewIcon({
  style,
  className,
}: {
  style: ProgressTrackerStyle;
  className?: string;
}) {
  if (style === "circles") {
    return (
      <svg
        className={className}
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        aria-hidden
      >
        <circle cx="16" cy="16" r="10" />
      </svg>
    );
  }

  if (style === "stars") {
    return (
      <svg
        className={className}
        viewBox="0 0 32 32"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M16 5.5 18.9 12l7.1.6-5.4 4.6 1.6 6.9L16 20.4 9.8 24.1l1.6-6.9L6 12.6l7.1-.6L16 5.5Z" />
      </svg>
    );
  }

  return (
    <svg
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="7" y="7" width="18" height="18" rx="4" />
    </svg>
  );
}

function getCompactActivityLabel(activity: ProgressTrackerActivity) {
  const labelsBySlug: Record<string, string> = {
    "coloring-pages": "Coloring Pages",
    "tracing-worksheets": "Tracing Worksheets",
    cut: "Cutting Practice",
    "number-sequencing": "Number Activities",
    "grid-puzzles": "Grid Puzzles",
    "puzzle-worksheet": "Puzzle Worksheets",
  };

  return labelsBySlug[activity.slug] ?? activity.label;
}

function clampTrackerCount(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(MAX_TRACKER_COUNT, Math.round(value)));
}

function buildTrackerFileName(fileName: string) {
  return fileName.replace(/(?:\.pdf)?$/i, "-activity-chart.pdf");
}

export function WorksheetProgressTrackerControls({
  topicTitle,
  fileName,
  activities,
}: WorksheetProgressTrackerControlsProps) {
  const trackerActivities = useMemo(
    () => activities.filter((activity) => activity.imageUrls.length > 0),
    [activities],
  );
  const initialSelectedActivitySlugs = useMemo(
    () => trackerActivities.map((activity) => activity.slug),
    [trackerActivities],
  );
  const initialTrackerCount = useMemo(
    () =>
      clampTrackerCount(
        Math.max(...trackerActivities.map((activity) => activity.imageUrls.length), 0),
      ),
    [trackerActivities],
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [paperSize, setPaperSize] = useState<PdfPaperSize>("letter");
  const [style, setStyle] = useState<ProgressTrackerStyle>("stars");
  const [selectedActivitySlugs, setSelectedActivitySlugs] = useState<string[]>(
    initialSelectedActivitySlugs,
  );
  const [trackerCount, setTrackerCount] = useState(initialTrackerCount);
  const selectedActivities = trackerActivities.filter((activity) =>
    selectedActivitySlugs.includes(activity.slug),
  );
  const totalSpots = selectedActivities.length * trackerCount;
  const allActivitiesSelected =
    trackerActivities.length > 0 &&
    selectedActivitySlugs.length === trackerActivities.length;
  const safeTopicTitle = topicTitle?.trim() || "Printable";

  const topicImageUrl =
    selectedActivities.find((activity) => activity.slug === "coloring-pages")
      ?.imageUrls[0] ??
    selectedActivities[0]?.imageUrls[0] ??
    null;

  function toggleActivity(slug: string) {
    setSelectedActivitySlugs((current) => {
      if (current.includes(slug)) {
        return current.filter((item) => item !== slug);
      }
      return [...current, slug];
    });
  }

  function selectAllActivities() {
    setSelectedActivitySlugs(trackerActivities.map((activity) => activity.slug));
  }

  function clearActivities() {
    setSelectedActivitySlugs([]);
  }

  async function handleDownload() {
    if (isDownloading || totalSpots === 0) {
      return;
    }

    setIsDownloading(true);
    try {
      await downloadProgressTrackerPdf({
        topicTitle: safeTopicTitle,
        fileName: buildTrackerFileName(fileName),
        paperSize,
        style,
        topicImageUrl,
        functions: selectedActivities.map((activity) => ({
          label: getCompactActivityLabel(activity),
          count: trackerCount,
        })),
      });
      setIsOpen(false);
    } catch (error) {
      console.error(error);
      window.alert("Failed to generate the activity chart. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  }

  if (trackerActivities.length === 0) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] border border-[#E8E2D8] bg-white px-5 py-3 text-[15px] font-bold text-[#3B352C] transition-colors hover:border-brand/70 hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 sm:w-auto"
        onClick={() => {
          setSelectedActivitySlugs(initialSelectedActivitySlugs);
          setTrackerCount(initialTrackerCount);
          setIsOpen(true);
        }}
      >
        <TrackerIcon className="h-4 w-4" />
        Download activity chart
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6">
          <div
            className="max-h-[calc(100vh-48px)] w-[calc(100vw-32px)] max-w-[560px] overflow-y-auto rounded-[20px] bg-white p-5 shadow-[0_24px_80px_rgba(59,53,44,0.18)] sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-labelledby="activity-chart-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2
                  id="activity-chart-title"
                  className="m-0 text-[22px] font-bold leading-[1.2] text-[#3B352C]"
                >
                  Activity chart
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#8F887C]">
                  My {safeTopicTitle} Activity Chart
                </p>
              </div>

              <button
                type="button"
                className="rounded-full border-0 bg-[#F7F1E7] px-3 py-1.5 text-sm font-semibold text-[#6F685D] transition hover:bg-[#EEE8DD] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => !isDownloading && setIsOpen(false)}
                disabled={isDownloading}
              >
                Close
              </button>
            </div>

            <fieldset className="mt-6 border-0 p-0">
              <div className="flex items-center justify-between gap-3">
                <legend className="text-sm font-bold text-[#3B352C]">
                  Content
                </legend>
                <div className="flex items-center gap-2 text-xs font-semibold text-[#8F887C]">
                  <span>
                    {selectedActivitySlugs.length}/{trackerActivities.length} selected
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
                {trackerActivities.map((activity) => {
                  const isSelected = selectedActivitySlugs.includes(activity.slug);
                  return (
                    <label
                      key={activity.slug}
                      className={`min-w-[112px] cursor-pointer rounded-full border-2 px-4 py-2 text-center text-sm font-semibold text-[#3B352C] sm:min-w-[124px] ${
                        isSelected
                          ? "border-brand bg-brand-soft"
                          : "border-[#E8E2D8] bg-white"
                      }`}
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

            <fieldset className="mt-6 border-0 p-0">
              <div className="flex items-center justify-between gap-3">
                <legend className="text-sm font-bold text-[#3B352C]">
                  Records per activity
                </legend>
                <span className="text-xs font-semibold text-[#8F887C]">
                  {totalSpots} total
                </span>
              </div>

              <div className="mt-3 flex items-center gap-3 rounded-[14px] border border-[#E8E2D8] bg-white px-3 py-2">
                <button
                  type="button"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#E8E2D8] bg-[#FBFAF7] text-lg font-bold text-[#6F685D] transition hover:border-brand/70 hover:text-[#3B352C]"
                  onClick={() => setTrackerCount((current) => clampTrackerCount(current - 1))}
                  aria-label="Decrease records per activity"
                >
                  -
                </button>
                <input
                  type="number"
                  min={1}
                  max={MAX_TRACKER_COUNT}
                  value={trackerCount}
                  className="h-10 min-w-0 flex-1 rounded-[10px] border border-[#E8E2D8] bg-white text-center text-sm font-bold text-[#3B352C] focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25"
                  onChange={(event) =>
                    setTrackerCount(clampTrackerCount(Number(event.target.value)))
                  }
                  aria-label="Records per activity"
                />
                <button
                  type="button"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#E8E2D8] bg-[#FBFAF7] text-lg font-bold text-[#6F685D] transition hover:border-brand/70 hover:text-[#3B352C]"
                  onClick={() => setTrackerCount((current) => clampTrackerCount(current + 1))}
                  aria-label="Increase records per activity"
                >
                  +
                </button>
              </div>
            </fieldset>

            <fieldset className="mt-6 border-0 p-0">
              <legend className="mb-2 text-sm font-bold text-[#3B352C]">
                Style
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {(["boxes", "circles", "stars"] as const).map((item) => {
                  const selected = style === item;
                  const labelByStyle: Record<ProgressTrackerStyle, string> = {
                    boxes: "Color-in boxes",
                    circles: "Stamp circles",
                    stars: "Reward stars",
                  };

                  return (
                    <button
                      key={item}
                      type="button"
                      className={`grid h-16 place-items-center rounded-[14px] border-2 transition ${
                        selected
                          ? "border-brand bg-brand-soft text-[#3B352C]"
                          : "border-[#E8E2D8] bg-white text-[#8F887C] hover:border-brand/70 hover:text-[#3B352C]"
                      }`}
                      onClick={() => setStyle(item)}
                      aria-label={labelByStyle[item]}
                      aria-pressed={selected}
                    >
                      <StylePreviewIcon style={item} className="h-8 w-8" />
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="mt-6 border-0 p-0">
              <legend className="mb-2 text-sm font-bold text-[#3B352C]">
                Paper
              </legend>
              <div className="grid grid-cols-2 rounded-[14px] bg-[#F7F1E7] p-1">
                <button
                  type="button"
                  className={`rounded-[10px] px-3 py-2 text-sm font-bold transition ${
                    paperSize === "a4"
                      ? "bg-white text-[#3B352C] shadow-[0_4px_14px_rgba(59,53,44,0.08)]"
                      : "text-[#8F887C] hover:text-[#3B352C]"
                  }`}
                  onClick={() => setPaperSize("a4")}
                  aria-pressed={paperSize === "a4"}
                >
                  A4
                </button>
                <button
                  type="button"
                  className={`rounded-[10px] px-3 py-2 text-sm font-bold transition ${
                    paperSize === "letter"
                      ? "bg-white text-[#3B352C] shadow-[0_4px_14px_rgba(59,53,44,0.08)]"
                      : "text-[#8F887C] hover:text-[#3B352C]"
                  }`}
                  onClick={() => setPaperSize("letter")}
                  aria-pressed={paperSize === "letter"}
                >
                  Letter
                </button>
              </div>
            </fieldset>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-[18px] border-0 bg-transparent px-5 py-3 text-[15px] font-bold text-[#8F887C] transition hover:text-[#3B352C] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => !isDownloading && setIsOpen(false)}
                disabled={isDownloading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-[18px] border-0 bg-brand px-5 py-3 text-[15px] font-bold text-brand-ink transition-colors enabled:hover:bg-brand-hover enabled:active:bg-brand-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45 disabled:cursor-not-allowed disabled:bg-brand-disabled"
                onClick={handleDownload}
                disabled={isDownloading || totalSpots === 0}
              >
                <DownloadIcon className="h-4 w-4" />
                {isDownloading ? "Generating..." : "Download activity chart"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
