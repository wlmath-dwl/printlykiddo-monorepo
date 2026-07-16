import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/components/site-header";
import { WordSearchMaker } from "@/components/word-search-maker";
import { getStaticHomeCategoryCards, getWordSearchLibrary, getWordSearchTheme, getWordSearchThemes } from "@/lib/d1";
import { buildSiteNavItems } from "@/lib/site-nav";
import { SITE_ORIGIN } from "@/lib/site-seo";
import { isStaticToolPageActive } from "@/lib/tool-static-data";

export const revalidate = false;

type ThemePageProps = { params: Promise<{ theme: string }> };

export const dynamicParams = false;

export async function generateStaticParams() {
  if (!isStaticToolPageActive("word-search-generator")) return [];
  const themes = await getWordSearchThemes();
  return themes.map((theme) => ({ theme: theme.slug }));
}

export async function generateMetadata({ params }: ThemePageProps): Promise<Metadata> {
  if (!isStaticToolPageActive("word-search-generator")) return {};
  const { theme: slug } = await params;
  const theme = await getWordSearchTheme(slug);
  if (!theme) return {};
  const name = theme.name;
  return {
    title: `${name} Word Search Printable | Free PDF Generator`,
    description: `Create a free printable ${name.toLowerCase()} word search for kids. Choose a child-friendly level and download the worksheet with an answer key.`,
    alternates: { canonical: `/tools/word-search-generator/${theme.slug}` },
  };
}

const titleCaseWord = (word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

export default async function ThemeWordSearchPage({ params }: ThemePageProps) {
  if (!isStaticToolPageActive("word-search-generator")) notFound();
  const { theme: slug } = await params;
  const [theme, themes, library, categories] = await Promise.all([getWordSearchTheme(slug), getWordSearchThemes(), getWordSearchLibrary(), getStaticHomeCategoryCards()]);
  if (!theme) notFound();
  const origin = SITE_ORIGIN.replace(/\/$/, "");
  const pageUrl = `${origin}/tools/word-search-generator/${theme.slug}`;
  const lowerName = theme.name.toLowerCase();
  const exampleWords = theme.words.slice(0, 10).map(titleCaseWord);
  const schema = {
    "@context": "https://schema.org", "@type": "WebApplication", name: `${theme.name} Word Search Generator`,
    url: pageUrl, applicationCategory: "EducationalApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description: `Create and download a printable ${lowerName} word search worksheet with an answer key.`,
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
      { "@type": "ListItem", position: 2, name: "Tools", item: `${origin}/create` },
      { "@type": "ListItem", position: 3, name: "Word Search Generator", item: `${origin}/tools/word-search-generator` },
      { "@type": "ListItem", position: 4, name: `${theme.name} Word Search`, item: pageUrl },
    ],
  };
  const relatedThemes = [
    ...themes.filter((item) => item.slug !== theme.slug && item.groupSlug === theme.groupSlug),
    ...themes.filter((item) => item.slug !== theme.slug && item.groupSlug !== theme.groupSlug),
  ].slice(0, 6);
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
        <li><Link href="/tools/word-search-generator" className="transition hover:text-brand-hover">Word Search Generator</Link></li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="font-semibold text-chocolate">{theme.name}</li>
      </ol>
    </nav>
    <WordSearchMaker key={theme.slug} themes={themes} library={library} initialThemeSlug={theme.slug} />
    <section className="border-t border-[#E7E2D9] bg-white/55">
      <div className="mx-auto w-full max-w-[760px] px-5 py-14 lg:px-10">
        <h2 className="text-2xl font-bold text-chocolate">About this {theme.name.toLowerCase()} word search</h2>
        <p className="mt-3 text-sm leading-7 text-charcoal/62">
          {theme.description || `This free printable ${lowerName} word search hides ${lowerName} words in a letter grid for kids to find and circle. It is a quick, screen-free activity for home or the classroom, and every worksheet comes with a matching answer key.`}
        </p>
        {exampleWords.length > 0 && <p className="mt-4 text-sm leading-7 text-charcoal/62">
          Words you can hide in this {lowerName} puzzle include {exampleWords.slice(0, -1).join(", ")}{exampleWords.length > 1 ? `, and ${exampleWords[exampleWords.length - 1]}` : exampleWords[0]}. Add your own words any time to make the worksheet your own.
        </p>}
        <p className="mt-4 text-sm leading-7 text-charcoal/62">
          <strong className="font-semibold text-chocolate">Beginner</strong> creates an 8×8 puzzle with up to 6 short words across and down. <strong className="font-semibold text-chocolate">Easy</strong> uses a 10×10 grid with up to 10 words and diagonals. <strong className="font-semibold text-chocolate">Challenge</strong> supports up to 15 words in every direction, including backwards. Choose a difficulty, then download the {lowerName} worksheet as a print-ready PDF.
        </p>
      </div>
    </section>
    {relatedThemes.length > 0 && <section className="border-t border-[#E7E2D9] bg-cream/45">
      <div className="mx-auto w-full max-w-[900px] px-5 py-12 lg:px-10">
        <h2 className="text-2xl font-bold text-chocolate">More Word Search Themes</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {relatedThemes.map((item) => <Link key={item.slug} href={`/tools/word-search-generator/${item.slug}`} className="rounded-xl border border-[#E7E2D9] bg-white px-4 py-3 text-sm font-bold text-chocolate transition hover:border-brand/55 hover:bg-brand-soft">{item.name} Word Search</Link>)}
        </div>
      </div>
    </section>}
  </main>;
}
