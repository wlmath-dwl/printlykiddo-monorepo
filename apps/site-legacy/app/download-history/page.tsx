import type { Metadata } from "next";

import { DownloadHistoryPageClient } from "@/components/download-history-page-client";
import { SiteHeader } from "@/components/site-header";
import { getHomeCategoryCards } from "@/lib/d1";
import { buildSiteNavItems } from "@/lib/site-nav";

export const metadata: Metadata = {
  title: "My Activities | PrintlyKiddo",
  description:
    "Find printable activities saved on this device from PrintlyKiddo.",
  alternates: {
    canonical: "/download-history",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function DownloadHistoryPage() {
  const homeCategories = await getHomeCategoryCards();
  const navItems = buildSiteNavItems(homeCategories);

  return (
    <main>
      <section className="w-full">
        <SiteHeader items={navItems} activePath="/download-history" subtle />
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-12 pt-10 lg:px-10">
        <DownloadHistoryPageClient />
      </section>
    </main>
  );
}
