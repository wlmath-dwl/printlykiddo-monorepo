import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { HomeCategoryGrid } from "@/components/home-category-grid";
import { JsonLd } from "@/components/json-ld";
import { RecentDownloadsSection } from "@/components/recent-downloads-section";
import { SiteHeader } from "@/components/site-header";
import { buildCollectionThemeStyle } from "@/lib/collection-theme";
import {
  getFeaturedCollections,
  getHomeCategoryCards,
  getHomepageConfig,
  type FeaturedCollection,
} from "@/lib/d1";
import { buildSiteNavItems } from "@/lib/site-nav";
import { buildHomepageSchemas } from "@/lib/seo-schema";
import { SITE_HOME_LOGO_URL } from "@/lib/site-seo";

/**
 * 改为 ISR：HTML 由 CDN 缓存，每小时刷新一次。
 * 首页内容主要受 D1 中类目影响，更新频率低，无需每次 SSR。
 */
export const revalidate = 3600;

function getCollectionTheme(collection: FeaturedCollection) {
  const normalized = `${collection.slug} ${collection.title}`.toLowerCase();

  if (/school|classroom|teacher/.test(normalized)) {
    return {
      title: "Back to School",
      description:
        "Coloring pages, tracing sheets, scissor skills, number sequencing and grid puzzles for preschool, kindergarten and early elementary.",
    };
  }

  return {
    title: collection.title,
    description:
      collection.subtitle ||
      collection.description ||
      "Printable worksheets, coloring pages, and classroom activities for kids.",
  };
}

function FeaturedCollectionCard({
  collection,
}: {
  collection: FeaturedCollection;
}) {
  const theme = getCollectionTheme(collection);

  return (
    <article
      className="collection-hero relative mx-auto min-h-[360px] w-full max-w-[1100px] overflow-hidden rounded-[14px] text-left shadow-[0_14px_32px_rgba(61,53,34,0.08)] md:min-h-[420px]"
      style={buildCollectionThemeStyle(collection.themeColor)}
    >
      {collection.heroImageUrl ? (
        <Image
          src={collection.heroImageUrl}
          alt=""
          fill
          sizes="(min-width: 1280px) 1280px, 100vw"
          loading="lazy"
          className="object-cover object-[72%_bottom] opacity-[0.95] lg:object-right-bottom"
          aria-hidden
        />
      ) : null}
      <div
        className="collection-home-overlay pointer-events-none absolute inset-y-0 left-0 w-full sm:w-[min(86%,38rem)] lg:w-[min(54%,36rem)]"
        aria-hidden
      />

      <div className="relative z-10 flex min-h-[360px] flex-col px-6 py-8 sm:px-8 md:min-h-[420px] lg:px-8 lg:py-0">
        <div className="flex max-w-[360px] flex-1 flex-col items-start justify-center lg:max-w-[420px]">
          <div>
            <h2 className="text-[length:clamp(1.8rem,3.4vw,2.7rem)] font-bold leading-[1.08] tracking-tight text-[#3D3522]">
              {theme.title}
            </h2>

            <p className="mt-4 max-w-[32ch] text-base leading-7 text-[#3D3522]/76 sm:text-[1.05rem] lg:max-w-[26rem]">
              {theme.description}
            </p>

            <div className="mt-5 flex flex-col items-start gap-3 md:flex-row md:items-center">
              <Link
                href={`/collections/${collection.slug}`}
                className="collection-theme-button inline-flex min-h-11 items-center justify-center rounded-[11px] px-5 py-2.5 text-base font-semibold leading-none transition-[background-color,box-shadow] duration-200 focus:outline-none"
              >
                Browse Back to School
              </Link>
              <Link
                href="/collections"
                className="text-sm font-semibold leading-5 text-[#3D3522]/62 underline underline-offset-4 transition-colors duration-200 hover:text-[#3D3522]"
              >
                View all collections
              </Link>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function FeaturedCollections({
  collections,
}: {
  collections: FeaturedCollection[];
}) {
  if (collections.length === 0) {
    return null;
  }

  const [primaryCollection] = collections;

  return (
    <section className="mx-auto mt-10 w-full max-w-[1100px] border-t border-[#EEE8DD] pt-8 md:mt-12 md:pt-10">
      <div className="mb-4">
        <h2 className="text-lg font-bold leading-tight text-chocolate">
          Featured Collection
        </h2>
      </div>
      <FeaturedCollectionCard collection={primaryCollection} />
    </section>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const homepage = await getHomepageConfig();
  return {
    title: homepage.seoTitle,
    description: homepage.seoDescription,
    alternates: {
      canonical: "/",
    },
  };
}

export default async function HomePage() {
  const [homepage, homeCategories, featuredCollections] = await Promise.all([
    getHomepageConfig(),
    getHomeCategoryCards(),
    getFeaturedCollections(1),
  ]);
  const homepageSchemas = buildHomepageSchemas(homepage, homeCategories);
  const navItems = buildSiteNavItems(homeCategories);

  return (
    <main>
      <JsonLd data={homepageSchemas} />

      <section className="w-full">
        <SiteHeader items={navItems} activePath="/" logoImageUrl={SITE_HOME_LOGO_URL} />
      </section>

      <section className="w-full px-6 pb-10 pt-6 lg:px-10 lg:pb-12 lg:pt-8">
        <section className="mx-auto flex w-full max-w-[1100px] flex-col gap-8 pb-14 pt-[72px] md:flex-row md:items-center md:justify-between md:gap-10">
          <div className="max-w-3xl text-left md:basis-[58%]">
            <h1 className="mb-4 max-w-[680px] text-[44px] font-bold leading-[1.15] text-chocolate">
              {homepage.title}
            </h1>
            <p className="mb-[18px] max-w-[600px] text-base leading-[1.6] text-[#5A5A5A] md:text-lg">
              {homepage.description}
            </p>
          </div>
          <div className="flex w-full justify-center md:basis-[38%] md:justify-end">
            <Image
              src={homepage.heroImageUrl || "/home-hero-activities.webp"}
              alt=""
              width={900}
              height={900}
              priority
              fetchPriority="high"
              sizes="(min-width: 1024px) 360px, (min-width: 768px) 34vw, 72vw"
              className="h-auto w-full max-w-[280px] object-contain sm:max-w-[340px] md:max-w-[360px] lg:max-w-[390px]"
              aria-hidden
            />
          </div>
        </section>

        <section
          id="printable-categories"
          className="mx-auto mt-16 w-full max-w-[1100px] scroll-mt-28"
          aria-labelledby="category-nav-title"
        >
          <div className="mb-5 max-w-3xl">
            <h2
              id="category-nav-title"
              className="text-[22px] font-semibold leading-tight text-chocolate"
            >
              Explore Free Printable Categories
            </h2>
          </div>
          <HomeCategoryGrid categories={homeCategories} />
        </section>

        <RecentDownloadsSection />

        <FeaturedCollections collections={featuredCollections} />

        <section className="mx-auto mt-10 w-full max-w-[1100px] border-t border-[#EEE8DD] pt-8 md:mt-12 md:pt-10">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-charcoal/38">
              Printable library
            </p>
            <h2 className="mt-1 text-lg font-bold leading-tight text-chocolate">
              Printable learning resources for kids
            </h2>
            <p className="mt-3 text-sm leading-7 text-charcoal/62 sm:text-base">
              Download free PDF printables for preschool, kindergarten, home
              practice, and classroom activities.
            </p>
            <p className="mt-2 text-sm leading-7 text-charcoal/58 sm:text-base">
              Includes coloring pages, tracing worksheets, cutting practice,
              number activities, and printable puzzles - all designed as
              ready-to-print PDFs for home or classroom use.
            </p>
          </div>
        </section>
      </section>
    </main>
  );
}
