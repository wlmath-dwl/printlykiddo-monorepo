"use client";

import { useEffect, useMemo, useState } from "react";

import { DownloadHistoryListItem } from "@/components/download-history-card";
import {
  clearDownloadHistory,
  readDownloadHistory,
  removeDownloadHistoryItem,
  subscribeDownloadHistory,
  type DownloadHistoryItem,
} from "@/lib/download-history";

const PAGE_SIZE = 5;

/** 生成 Google 风格页码序列：首页、末页、当前页附近，其余用省略号占位。 */
function buildPageList(currentPage: number, pageCount: number): Array<number | "ellipsis"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const pages: Array<number | "ellipsis"> = [1];
  const start = Math.max(2, currentPage - 1);
  const end = Math.min(pageCount - 1, currentPage + 1);

  if (start > 2) {
    pages.push("ellipsis");
  }
  for (let page = start; page <= end; page += 1) {
    pages.push(page);
  }
  if (end < pageCount - 1) {
    pages.push("ellipsis");
  }
  pages.push(pageCount);

  return pages;
}

function Header({ onClear }: { onClear?: () => void }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-3">
      <h1 className="text-3xl font-semibold leading-tight tracking-tight text-warm-ink">
        Recently Printed
      </h1>
      {onClear ? (
        <button
          type="button"
          className="inline-flex shrink-0 items-center justify-center rounded-lg bg-brand px-4 py-2 text-sm font-bold text-brand-ink shadow-[0_6px_16px_rgba(58,42,25,0.08)] transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45"
          onClick={onClear}
        >
          Clear all
        </button>
      ) : null}
    </div>
  );
}

export function DownloadHistoryPageClient() {
  const [items, setItems] = useState<DownloadHistoryItem[]>([]);
  const [page, setPage] = useState(1);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    function refresh() {
      setItems(readDownloadHistory().items);
    }

    refresh();
    return subscribeDownloadHistory(refresh);
  }, []);

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pagedItems = useMemo(
    () => items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [currentPage, items],
  );

  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);

  function removeItem(id: string) {
    removeDownloadHistoryItem(id);
  }

  function clearAll() {
    if (window.confirm("Clear all download history saved on this device?")) {
      clearDownloadHistory();
    }
  }

  if (!mounted) {
    return (
      <div>
        <Header />
        <div className="min-h-[40vh]" aria-hidden="true" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div>
        <Header />
        <div className="rounded-2xl border border-[#EEE8DD] bg-white px-5 py-8 text-center shadow-[0_10px_28px_rgba(58,42,25,0.05)]">
          <h2 className="text-lg font-bold text-warm-ink">No activities yet.</h2>
          <p className="mt-2 text-sm leading-6 text-charcoal/58">
            Printed activities will appear here on this device.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header onClear={clearAll} />

      <div className="flex flex-col gap-2.5">
        {pagedItems.map((item) => (
          <DownloadHistoryListItem
            key={item.id}
            item={item}
            onRemove={removeItem}
          />
        ))}
      </div>

      {pageCount > 1 ? (
        <nav
          className="mt-8 flex flex-col items-center gap-3"
          aria-label="Download history pages"
        >
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="grid size-9 place-items-center rounded-lg border border-black/[0.08] text-charcoal/62 transition enabled:hover:border-black/[0.14] enabled:hover:text-warm-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45"
              aria-label="Previous page"
              disabled={currentPage <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              ‹
            </button>

            {buildPageList(currentPage, pageCount).map((entry, index) =>
              entry === "ellipsis" ? (
                <span
                  key={`ellipsis-${index}`}
                  className="grid size-9 place-items-center text-sm text-charcoal/40"
                  aria-hidden="true"
                >
                  …
                </span>
              ) : (
                <button
                  key={entry}
                  type="button"
                  aria-label={`Page ${entry}`}
                  aria-current={entry === currentPage ? "page" : undefined}
                  className={
                    entry === currentPage
                      ? "grid size-9 place-items-center rounded-lg bg-brand text-sm font-bold text-brand-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45"
                      : "grid size-9 place-items-center rounded-lg border border-black/[0.08] text-sm font-semibold text-charcoal/62 transition hover:border-black/[0.14] hover:text-warm-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45"
                  }
                  onClick={() => setPage(entry)}
                >
                  {entry}
                </button>
              ),
            )}

            <button
              type="button"
              className="grid size-9 place-items-center rounded-lg border border-black/[0.08] text-charcoal/62 transition enabled:hover:border-black/[0.14] enabled:hover:text-warm-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45"
              aria-label="Next page"
              disabled={currentPage >= pageCount}
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            >
              ›
            </button>
          </div>
          <p className="text-xs text-charcoal/45">{items.length} activities</p>
        </nav>
      ) : null}
    </div>
  );
}
