import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CategoryDirectoryCard } from "@/components/category-card-grid";
import { JsonLd } from "@/components/json-ld";
import { SiteHeader } from "@/components/site-header";
import { buildCollectionThemeStyle } from "@/lib/collection-theme";
import {
  getFeaturedCollections,
  getFirstCategories,
  getSpecialPageBySlug,
} from "@/lib/d1";
import { buildSiteNavItems } from "@/lib/site-nav";
import { buildSpecialPageSchemas } from "@/lib/seo-schema";
import { SITE_DOMAIN_LABEL, SITE_HOME_LOGO_URL } from "@/lib/site-seo";

export const dynamic = "force-static";
export const revalidate = 3600;

type CollectionPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  const collections = await getFeaturedCollections(1000);
  return collections.map((collection) => ({ slug: collection.slug }));
}

function getCollectionSeoDescription(page: NonNullable<Awaited<ReturnType<typeof getSpecialPageBySlug>>>) {
  return (
    page.seoDescription ||
    page.description ||
    page.subtitle ||
    "Browse this printable collection for home, homeschool, and classroom use."
  );
}

function getCollectionDisplayDescription(page: NonNullable<Awaited<ReturnType<typeof getSpecialPageBySlug>>>) {
  return (
    page.subtitle ||
    page.description ||
    page.seoDescription ||
    "Browse this printable collection for home, homeschool, and classroom use."
  );
}

function normalizeItemHref(url: string) {
  const trimmed = url.trim();
  if (!trimmed) {
    return "/";
  }
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export async function generateMetadata({
  params,
}: CollectionPageProps): Promise<Metadata> {
  const { slug } = await params;
  const specialPage = await getSpecialPageBySlug(slug);

  if (!specialPage) {
    return {
      title: `Collection not found | ${SITE_DOMAIN_LABEL}`,
      description: "The requested printable collection could not be found.",
    };
  }

  const title = specialPage.seoTitle || `${specialPage.title} | ${SITE_DOMAIN_LABEL}`;
  const description = getCollectionSeoDescription(specialPage);
  const canonicalPath = `/collections/${specialPage.slug}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath,
    },
    openGraph: {
      title,
      description,
      url: canonicalPath,
      images: specialPage.heroImageUrl
        ? [
            {
              url: specialPage.heroImageUrl,
              width: 1600,
              height: 900,
              alt: `${specialPage.title} preview`,
            },
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: specialPage.heroImageUrl ? [specialPage.heroImageUrl] : undefined,
    },
  };
}

export default async function CollectionPage({ params }: CollectionPageProps) {
  const { slug } = await params;
  const [specialPage, firstCategories] = await Promise.all([
    getSpecialPageBySlug(slug),
    getFirstCategories(),
  ]);

  if (!specialPage) {
    notFound();
  }

  const navItems = buildSiteNavItems(firstCategories);
  const pageDescription = getCollectionDisplayDescription(specialPage);
  const schemas = buildSpecialPageSchemas(specialPage);

  return (
    <main>
      <JsonLd data={schemas} />

      <section className="w-full">
        <SiteHeader
          items={navItems}
          activePath="/collections"
          logoImageUrl={SITE_HOME_LOGO_URL}
        />
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-8 lg:px-10">
        <nav className="text-sm text-charcoal/55" aria-label="Breadcrumb">
          <Link href="/" className="transition hover:text-chocolate">
            Home
          </Link>
          <span className="px-2 text-charcoal/30" aria-hidden>
            /
          </span>
          <Link href="/collections" className="transition hover:text-chocolate">
            Collections
          </Link>
          <span className="px-2 text-charcoal/30" aria-hidden>
            /
          </span>
          <span className="text-charcoal">{specialPage.title}</span>
        </nav>

        {specialPage.heroImageUrl ? (
          <section
            className="collection-hero relative mt-7 overflow-hidden rounded-[22px] border border-[#E5E7EB] shadow-[0_16px_42px_rgba(61,53,34,0.07)] min-[480px]:min-h-[300px] md:min-h-[340px] xl:min-h-[360px]"
            style={buildCollectionThemeStyle(specialPage.themeColor)}
          >
            <div className="relative mt-4 aspect-[16/9] overflow-hidden rounded-2xl bg-[#EAF6FF] max-[479px]:mx-4 max-[479px]:mb-4 min-[480px]:absolute min-[480px]:inset-0 min-[480px]:m-0 min-[480px]:aspect-auto min-[480px]:rounded-none">
              <Image
                src={specialPage.heroImageUrl}
                alt={`${specialPage.title} preview`}
                fill
                sizes="100vw"
                priority
                fetchPriority="high"
                className="object-cover object-[72%_72%] min-[480px]:object-[74%_78%] md:object-[66%_80%] xl:object-[60%_82%]"
              />
            </div>
            <div className="collection-detail-overlay pointer-events-none absolute inset-0 hidden min-[480px]:block" />
            <div className="collection-detail-copy relative z-10 px-5 pb-6 pt-2 min-[480px]:max-w-[430px] min-[480px]:px-8 min-[480px]:py-9 md:max-w-[470px] md:px-10 lg:max-w-[500px] lg:px-12">
              <h1 className="text-3xl font-bold leading-tight tracking-tight text-chocolate md:text-4xl lg:text-5xl">
                {specialPage.title}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-charcoal/72 md:text-base">
                {pageDescription}
              </p>
            </div>
          </section>
        ) : (
          <section className="mt-8 max-w-3xl">
            <h1 className="text-3xl font-bold leading-tight tracking-tight text-chocolate md:text-5xl">
              {specialPage.title}
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-charcoal/68 md:text-base">
              {pageDescription}
            </p>
          </section>
        )}

        <section id="collection-topics" className="mt-8 border-t border-[#EEE8DD] pt-7 md:mt-10">
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold leading-tight text-chocolate md:text-2xl">
              Explore Free Printable Topics
            </h2>
          </div>

          {specialPage.items.length > 0 ? (
            <div className="mt-6 grid w-full grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
              {specialPage.items.map((item, index) => {
                const href = normalizeItemHref(item.url);

                return (
                  <CategoryDirectoryCard
                    key={`${href}-${item.title}`}
                    title={item.title}
                    badgeLabel="Topics"
                    imageUrl={item.imageUrl}
                    href={href}
                    imageLoading={
                      specialPage.heroImageUrl
                        ? "lazy"
                        : index === 0
                          ? "eager"
                          : "lazy"
                    }
                    imageFetchPriority={
                      !specialPage.heroImageUrl && index === 0
                        ? "high"
                        : undefined
                    }
                  />
                );
              })}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-[#E5E7EB] bg-white px-5 py-6 text-sm text-charcoal/62">
              No printable topics are available in this collection yet.
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
