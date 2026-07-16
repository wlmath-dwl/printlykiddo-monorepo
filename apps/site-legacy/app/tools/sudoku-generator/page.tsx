import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteHeader } from "@/components/site-header";
import { SudokuMaker } from "@/components/sudoku-maker";
import { getHomeCategoryCards } from "@/lib/d1";
import { buildSiteNavItems } from "@/lib/site-nav";
import { SITE_ORIGIN } from "@/lib/site-seo";
import { isStaticToolPageActive } from "@/lib/tool-static-data";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Free Printable Sudoku Generator for Kids | PrintlyKiddo",
  description: "Create free printable Sudoku worksheets for kids. Choose 3×3, 4×4, 6×6, or 9×9 puzzles and difficulty, then download a worksheet with an optional answer key.",
  alternates: { canonical: "/tools/sudoku-generator" },
};

export default async function SudokuGeneratorPage() {
  if (!isStaticToolPageActive("sudoku-generator")) notFound();
  const navItems = buildSiteNavItems(await getHomeCategoryCards());
  const origin = SITE_ORIGIN.replace(/\/$/, "");
  const pageUrl = `${origin}/tools/sudoku-generator`;
  const schema = {
    "@context": "https://schema.org", "@type": "WebApplication", name: "Sudoku Generator",
    url: pageUrl, applicationCategory: "EducationalApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description: "Create free printable Sudoku worksheets for kids and download a PDF with an optional answer key.",
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
      { "@type": "ListItem", position: 2, name: "Tools", item: `${origin}/create` },
      { "@type": "ListItem", position: 3, name: "Sudoku Generator", item: pageUrl },
    ],
  };
  return <main>
    <SiteHeader items={navItems} activePath="/tools/sudoku-generator" />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema).replace(/</g, "\\u003c") }} />
    <nav aria-label="Breadcrumb" className="mx-auto w-full max-w-[1180px] px-5 pt-6 lg:px-10">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-charcoal/55">
        <li><Link href="/" className="transition hover:text-brand-hover">Home</Link></li>
        <li aria-hidden="true">/</li>
        <li><Link href="/create" className="transition hover:text-brand-hover">Tools</Link></li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="font-semibold text-chocolate">Sudoku Generator</li>
      </ol>
    </nav>
    <SudokuMaker />
    <section className="border-t border-[#E7E2D9] bg-white/55">
      <div className="mx-auto w-full max-w-[760px] px-5 py-14 lg:px-10">
        <h2 className="text-2xl font-bold text-chocolate">Kid-friendly Sudoku for every level</h2>
        <p className="mt-3 text-sm leading-7 text-charcoal/62">
          Each puzzle is generated with a single, logical solution — no guessing required. Choose your grid size and difficulty, print on US Letter or A4, and include a matching answer key so grading takes seconds. Younger kids can even play with shapes instead of numbers.
        </p>
        <h3 className="mt-8 text-lg font-bold text-chocolate">Grid sizes and difficulty</h3>
        <ul className="mt-3 space-y-2 text-sm leading-7 text-charcoal/62">
          <li><strong className="font-semibold text-chocolate">3×3 &amp; 4×4</strong> — gentle introductions with numbers or shapes, ideal for preschool and kindergarten.</li>
          <li><strong className="font-semibold text-chocolate">6×6</strong> — a step up with Practice and Challenge levels for growing solvers.</li>
          <li><strong className="font-semibold text-chocolate">9×9 classic</strong> — Easy, Medium, and Hard, each graded by the solving techniques it actually needs so the difficulty feels right every time.</li>
        </ul>
        <p className="mt-6 text-sm leading-7 text-charcoal/62">
          Sudoku builds logical thinking, patience, and number confidence — all screen-free. Great for morning warm-ups, math centers, or a calm activity at home.
          {isStaticToolPageActive("maze-generator") ? <> Want more puzzles? Try our <Link href="/tools/maze-generator" className="font-semibold text-brand-hover hover:underline">maze generator</Link>.</> : null}
        </p>
      </div>
    </section>
  </main>;
}
