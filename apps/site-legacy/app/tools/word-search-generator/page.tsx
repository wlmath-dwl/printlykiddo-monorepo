import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/components/site-header";
import { WordSearchMaker } from "@/components/word-search-maker";
import { getStaticHomeCategoryCards, getWordSearchLibrary, getWordSearchThemes } from "@/lib/d1";
import { buildSiteNavItems } from "@/lib/site-nav";
import { SITE_ORIGIN } from "@/lib/site-seo";
import { isStaticToolPageActive } from "@/lib/tool-static-data";

export const revalidate = false;

export const metadata: Metadata = {
  title: "Free Printable Word Search Generator for Kids | PrintlyKiddo",
  description: "Create free printable word search worksheets for kids. Choose a theme and child-friendly difficulty, then download a PDF with an answer key.",
  alternates: { canonical: "/tools/word-search-generator" },
};

export default async function WordSearchGeneratorPage() {
  if (!isStaticToolPageActive("word-search-generator")) notFound();
  const [categories, themes, library] = await Promise.all([getStaticHomeCategoryCards(), getWordSearchThemes(), getWordSearchLibrary()]);
  const origin = SITE_ORIGIN.replace(/\/$/, "");
  const pageUrl = `${origin}/tools/word-search-generator`;
  const schema = {
    "@context": "https://schema.org", "@type": "WebApplication", name: "Word Search Generator",
    url: pageUrl, applicationCategory: "EducationalApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description: "Create free printable word search worksheets for kids and download a PDF with an answer key.",
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
      { "@type": "ListItem", position: 2, name: "Tools", item: `${origin}/create` },
      { "@type": "ListItem", position: 3, name: "Word Search Generator", item: pageUrl },
    ],
  };
  const featuredThemes = [...library.map((group) => group.topics[0]).filter(Boolean), ...themes]
    .filter((theme, index, items) => items.findIndex((item) => item.slug === theme.slug) === index)
    .slice(0, 12);
  return <main>
    <SiteHeader items={buildSiteNavItems(categories)} activePath="/tools/word-search-generator" />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema).replace(/</g, "\\u003c") }} />
    <nav aria-label="Breadcrumb" className="mx-auto w-full max-w-[1180px] px-5 pt-6 lg:px-10">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-charcoal/55">
        <li><Link href="/" className="transition hover:text-brand-hover">Home</Link></li>
        <li aria-hidden="true">/</li>
        <li><Link href="/create" className="transition hover:text-brand-hover">Tools</Link></li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="font-semibold text-chocolate">Word Search Generator</li>
      </ol>
    </nav>
    <WordSearchMaker themes={themes} library={library} />
    <section className="border-t border-[#E7E2D9] bg-white/55">
      <div className="mx-auto w-full max-w-[1180px] px-5 py-14 lg:px-10">
        <h2 className="text-2xl font-bold text-chocolate">Browse Word Search Themes</h2>
        <p className="mt-2 text-sm leading-6 text-charcoal/62">Start with a ready-made vocabulary list, then customize the words and difficulty.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {featuredThemes.map((theme) => <Link key={theme.slug} href={`/tools/word-search-generator/${theme.slug}`} className="rounded-xl border border-[#E7E2D9] bg-white px-4 py-3 text-sm font-bold text-chocolate transition hover:border-brand/55 hover:bg-brand-soft">{theme.name} Word Search</Link>)}
        </div>
      </div>
    </section>
  </main>;
}
