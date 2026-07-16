"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

import type {
  WorksheetPdfActivity,
  WorksheetPdfTopic,
} from "@/components/worksheet-pdf-controls-modal";
import { WorksheetProgressTrackerControls } from "@/components/worksheet-progress-tracker-controls";
import type { DownloadHistoryCategory } from "@/lib/download-history";

export type {
  WorksheetPdfActivity,
  WorksheetPdfTopic,
} from "@/components/worksheet-pdf-controls-modal";

type WorksheetPdfControlsProps = {
  fileName: string;
  activities: WorksheetPdfActivity[];
  topicTitle?: string;
  topicOptions?: WorksheetPdfTopic[];
  initialTopicId?: number | null;
  /** 资源页用：弹框打开后再异步加载兄弟 topic */
  currentCategoryPath?: string;
  /** 益智类只保留统一 PDF 下载，不显示活动表下载。 */
  hideActivityChart?: boolean;
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

/**
 * 弹框 + pdf-lib 触发逻辑都按需加载，避免出现在资源页首屏 chunk。
 * `ssr: false` 配合 `loading: null` 能彻底跳过 server bundle。
 */
const WorksheetPdfControlsModal = dynamic(
  () => import("@/components/worksheet-pdf-controls-modal"),
  { ssr: false, loading: () => null },
);

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

export function WorksheetPdfControls({
  fileName,
  activities,
  topicTitle,
  topicOptions,
  initialTopicId = null,
  currentCategoryPath,
  hideActivityChart = false,
  downloadHistoryContext,
}: WorksheetPdfControlsProps) {
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const hasActivities =
    (topicOptions?.some((topic) => topic.activities.length > 0) ?? false) ||
    activities.some((activity) => activity.imageUrls.length > 0);

  return (
    <section className="mb-12 rounded-2xl border border-[#F1EBDD] bg-white px-4 py-4 shadow-panel-warm sm:px-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="m-0 text-sm font-semibold text-[#3B352C]">
            Free printable PDF
          </p>
          <p className="mt-1 text-xs leading-5 text-[#8F887C]">
            {hideActivityChart
              ? "Download the worksheets as a print-ready PDF."
              : "Download worksheets or print a simple activity chart for this topic."}
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:justify-end">
          {hideActivityChart ? null : (
            <WorksheetProgressTrackerControls
              topicTitle={topicTitle}
              fileName={fileName}
              activities={activities}
            />
          )}
          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] border-0 bg-brand px-5 py-3 text-[15px] font-bold text-brand-ink transition-colors enabled:hover:bg-brand-hover enabled:active:bg-brand-active focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45 disabled:cursor-not-allowed disabled:bg-brand-disabled sm:w-auto"
            onClick={() => setIsOptionsOpen(true)}
            disabled={isDownloading || !hasActivities}
          >
            <DownloadIcon className="h-4 w-4" />
            {isDownloading ? "Generating..." : "Download / Print PDF"}
          </button>
        </div>
      </div>

      {isOptionsOpen ? (
        <WorksheetPdfControlsModal
          fileName={fileName}
          activities={activities}
          topicOptions={topicOptions}
          initialTopicId={initialTopicId}
          currentCategoryPath={currentCategoryPath}
          downloadHistoryContext={downloadHistoryContext}
          isDownloading={isDownloading}
          setIsDownloading={setIsDownloading}
          onClose={() => setIsOptionsOpen(false)}
        />
      ) : null}
    </section>
  );
}
