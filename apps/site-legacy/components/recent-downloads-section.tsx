"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { DownloadHistoryCompactCard } from "@/components/download-history-card";
import {
  readDownloadHistory,
  subscribeDownloadHistory,
  type DownloadHistoryItem,
} from "@/lib/download-history";

/** 首页最近下载最多展示条数（一行两个的长条卡片）。 */
const MAX_VISIBLE = 4;

export function RecentDownloadsSection() {
  const [items, setItems] = useState<DownloadHistoryItem[]>([]);

  useEffect(() => {
    function refresh() {
      setItems(readDownloadHistory().items);
    }

    refresh();
    return subscribeDownloadHistory(refresh);
  }, []);

  const visibleItems = useMemo(
    () => items.slice(0, MAX_VISIBLE),
    [items],
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <section
      className="mx-auto mt-10 w-full max-w-[1100px] border-t border-[#EEE8DD] pt-8 md:mt-12 md:pt-10"
      aria-labelledby="recent-downloads-title"
    >
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2
            id="recent-downloads-title"
            className="text-lg font-bold leading-tight text-chocolate"
          >
            Recently Downloaded
          </h2>
        </div>
        <Link
          href="/download-history"
          className="shrink-0 text-sm font-semibold text-warm-coffee underline underline-offset-4 transition hover:text-warm-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/45"
        >
          View all
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {visibleItems.map((item) => (
          <DownloadHistoryCompactCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}
