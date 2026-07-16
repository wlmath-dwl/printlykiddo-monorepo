import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { JsonLd } from "@/components/json-ld";
import { SiteHeader } from "@/components/site-header";
import { getFeaturedCollections, getHomeCategoryCards } from "@/lib/d1";
import { buildBreadcrumbSchema } from "@/lib/seo-schema";
import { buildSiteNavItems } from "@/lib/site-nav";
import { SITE_DOMAIN_LABEL, SITE_HOME_LOGO_URL } from "@/lib/site-seo";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Free Printable Collections for Kids | PrintlyKiddo",
  description:
    "Browse free printable collections for kids, including coloring pages, worksheets, activity pages, classroom themes, holidays, and at-home learning resources.",
  alternates: {
    canonical: "/collections",
  },
};

export default async function CollectionsPage() {
  const [homeCategories, collections] = await Promise.all([
    getHomeCategoryCards(),
    getFeaturedCollections(24),
  ]);
  const navItems = buildSiteNavItems(homeCategories);
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: "Home", path: "/" },
    { name: "Collections", path: "/collections" },
  ]);

  return (
    <main>
      <JsonLd data={breadcrumbSchema} />

      <section className="w-full">
        <SiteHeader
          items={navItems}
          activePath="/collections"
          logoImageUrl={SITE_HOME_LOGO_URL}
        />
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-16 pt-8 lg:px-10">
        <nav className="text-sm text-charcoal/55" aria-label="Breadcrumb">
          <Link className="transition hover:text-chocolate" href="/">
            Home
          </Link>
          <span className="px-2 text-charcoal/30" aria-hidden="true">
            /
          </span>
          <span className="text-charcoal">Collections</span>
        </nav>

        <div className="max-w-2xl">
          <h1 className="mt-7 text-3xl font-bold leading-tight tracking-tight text-chocolate md:text-4xl">
            Printable Collections
          </h1>
          <p className="mt-3 text-sm leading-7 text-charcoal/68 md:text-base">
            Browse free seasonal and topic-based printable collections for
            classroom, homeschool, and at-home learning.
          </p>
        </div>

        {collections.length > 0 ? (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection) => {
              const description =
                collection.subtitle ||
                collection.description ||
                "Printable worksheets, coloring pages, and classroom activities for kids.";
              const imageUrl = collection.cardImageUrl || collection.heroImageUrl;

              return (
                <Link
                  key={collection.slug}
                  href={`/collections/${collection.slug}`}
                  className="group overflow-hidden rounded-xl border border-[#E5E7EB] bg-white transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[#F59E0B]/35 hover:shadow-[0_14px_34px_rgba(61,53,34,0.08)]"
                >
                  <div className="relative aspect-[5/3] bg-white">
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt={`${collection.title} preview`}
                        fill
                        sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 90vw"
                        className="object-cover"
                      />
                    ) : (
                      <div className="grid h-full place-items-center text-sm font-semibold text-charcoal/35">
                        Print Pack
                      </div>
                    )}
                  </div>
                  <div className="border-t border-[#E5E7EB] px-4 py-4">
                    <h2 className="text-base font-bold leading-snug text-chocolate">
                      {collection.title}
                    </h2>
                    <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-charcoal/62">
                      {description}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="mt-8 rounded-xl border border-[#E5E7EB] bg-white px-5 py-6 text-sm text-charcoal/62">
            No printable collections are available yet.
          </div>
        )}
      </section>
    </main>
  );
}
