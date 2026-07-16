"use client";

import Link from "next/link";
import { useState } from "react";

import type { DownloadHistoryItem } from "@/lib/download-history";

function formatRelativeDownloadTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Printed recently";
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor(
    (startOfToday.getTime() - startOfDate.getTime()) / 86_400_000,
  );

  if (diffDays <= 0) {
    return "Printed today";
  }
  if (diffDays === 1) {
    return "Printed yesterday";
  }
  return `Printed ${date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function getActivityTypes(item: DownloadHistoryItem) {
  return item.activityLabels.map((label) => label.trim()).filter(Boolean);
}

function Thumbnail({
  item,
  className = "",
}: {
  item: DownloadHistoryItem;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!item.thumbnail || failed) {
    return (
      <div
        className={`grid place-items-center bg-white text-center text-xs font-semibold uppercase tracking-[0.16em] text-warm-coffee/45 ${className}`}
        aria-label="Printable preview unavailable"
      >
        Preview
      </div>
    );
  }

  return (
    <img
      src={item.thumbnail}
      alt={item.thumbnailAlt}
      className={`bg-white object-contain ${className}`}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

export function DownloadHistoryCompactCard({
  item,
}: {
  item: DownloadHistoryItem;
}) {
  const activityTypes = getActivityTypes(item);

  return (
    <Link
      href={item.url}
      className="group flex min-w-0 gap-3 rounded-xl border border-black/[0.07] bg-white p-2.5 shadow-[0_6px_18px_rgba(58,42,25,0.035)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(58,42,25,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45"
    >
      <Thumbnail
        item={item}
        className="h-16 w-16 shrink-0 rounded-lg border border-black/[0.06] p-1.5"
      />
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="line-clamp-1 text-sm font-bold leading-snug text-warm-ink">
            {item.name}
          </h3>
          <span className="shrink-0 text-xs text-charcoal/45">
            {formatRelativeDownloadTime(item.lastDownloadedAt)}
          </span>
        </div>
        {activityTypes.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-x-2 gap-y-1 text-xs font-semibold text-charcoal/62">
            {activityTypes.map((label) => (
              <span
                key={label}
                className="rounded-md bg-cream px-2 py-0.5 text-charcoal/62"
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

export function DownloadHistoryListItem({
  item,
  onRemove,
}: {
  item: DownloadHistoryItem;
  onRemove?: (id: string) => void;
}) {
  const activityTypes = getActivityTypes(item);

  function handleRemove() {
    if (!onRemove) {
      return;
    }
    if (window.confirm(`Remove "${item.name}" from history?`)) {
      onRemove(item.id);
    }
  }

  return (
    <article className="group relative flex min-w-0 items-stretch gap-3 rounded-xl border border-black/[0.07] bg-white p-3 shadow-[0_6px_18px_rgba(58,42,25,0.04)] transition hover:border-black/[0.12] hover:shadow-[0_10px_24px_rgba(58,42,25,0.07)] sm:gap-4 sm:p-4">
      {/* 覆盖整卡的点击区域：点卡片任意位置即进入 */}
      <Link
        href={item.url}
        className="absolute inset-0 z-10 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45"
        aria-label={`Open ${item.name}`}
      />

      <Thumbnail
        item={item}
        className="size-[72px] shrink-0 self-center rounded-lg border border-black/[0.06] p-1.5 sm:size-20"
      />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 className="line-clamp-1 text-sm font-bold leading-snug text-warm-ink sm:text-base">
            {item.name}
          </h3>
          <span className="shrink-0 text-xs text-charcoal/45">
            {formatRelativeDownloadTime(item.lastDownloadedAt)}
          </span>
        </div>
        {activityTypes.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-x-2 gap-y-1 text-xs font-semibold text-charcoal/62">
            {activityTypes.map((label) => (
              <span
                key={label}
                className="rounded-md bg-cream px-2 py-0.5 text-charcoal/62"
              >
                {label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {onRemove ? (
        <div className="flex shrink-0 items-end justify-end self-end">
          <button
            type="button"
            className="relative z-20 inline-flex min-h-9 items-center justify-center rounded-lg border border-transparent px-3 py-1.5 text-xs font-semibold text-charcoal/45 transition hover:bg-cream hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45 sm:text-sm"
            onClick={handleRemove}
          >
            Remove
          </button>
        </div>
      ) : null}
    </article>
  );
}


