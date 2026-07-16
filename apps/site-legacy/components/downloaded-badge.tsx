"use client";

import { useEffect, useState } from "react";

import {
  hasDownloadedItem,
  subscribeDownloadHistory,
} from "@/lib/download-history";

export function DownloadedBadge({
  id,
  url,
}: {
  id: string | number;
  url?: string | null;
}) {
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    function refresh() {
      setDownloaded(hasDownloadedItem(id, url));
    }

    refresh();
    return subscribeDownloadHistory(refresh);
  }, [id, url]);

  if (!downloaded) {
    return null;
  }

  return (
    <span className="absolute right-2 top-2 z-20 rounded-full border border-[#E6D7BB] bg-[#FFF8E7]/95 px-2 py-1 text-[11px] font-bold leading-none text-warm-coffee shadow-[0_5px_14px_rgba(58,42,25,0.08)]">
      Downloaded
    </span>
  );
}
