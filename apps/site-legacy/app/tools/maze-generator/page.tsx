import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MazeMaker } from "@/components/maze-maker";
import { SiteHeader } from "@/components/site-header";
import { getHomeCategoryCards } from "@/lib/d1";
import { buildSiteNavItems } from "@/lib/site-nav";
import { SITE_ORIGIN } from "@/lib/site-seo";
import { isStaticToolPageActive } from "@/lib/tool-static-data";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Free Printable Maze Generator for Kids | PrintlyKiddo",
  description: "Create free printable maze worksheets for preschool, kindergarten, and elementary kids. Choose a difficulty, shuffle the maze, and download a print-ready PDF with an optional answer key.",
  alternates: { canonical: "/tools/maze-generator" },
};

export default async function MazeGeneratorPage() {
  if (!isStaticToolPageActive("maze-generator")) notFound();
  const navItems = buildSiteNavItems(await getHomeCategoryCards());
  const origin = SITE_ORIGIN.replace(/\/$/, "");
  const pageUrl = `${origin}/tools/maze-generator`;
  const schema = {
    "@context": "https://schema.org", "@type": "WebApplication", name: "Maze Generator",
    url: pageUrl, applicationCategory: "EducationalApplication", operatingSystem: "Any", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description: "Create free printable maze worksheets for kids and download a PDF with an answer key.",
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${origin}/` },
      { "@type": "ListItem", position: 2, name: "Tools", item: `${origin}/create` },
      { "@type": "ListItem", position: 3, name: "Maze Generator", item: pageUrl },
    ],
  };
  return <main>
    <SiteHeader items={navItems} activePath="/tools/maze-generator" />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema).replace(/</g, "\\u003c") }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema).replace(/</g, "\\u003c") }} />
    <nav aria-label="Breadcrumb" className="mx-auto w-full max-w-[1180px] px-5 pt-6 lg:px-10">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-charcoal/55">
        <li><Link href="/" className="transition hover:text-brand-hover">Home</Link></li>
        <li aria-hidden="true">/</li>
        <li><Link href="/create" className="transition hover:text-brand-hover">Tools</Link></li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="font-semibold text-chocolate">Maze Generator</li>
      </ol>
    </nav>
    <MazeMaker />
    <section className="border-t border-[#E7E2D9] bg-white/55">
      <div className="mx-auto w-full max-w-[760px] px-5 py-14 lg:px-10">
        <h2 className="text-2xl font-bold text-chocolate">Printable mazes that grow with your child</h2>
        <p className="mt-3 text-sm leading-7 text-charcoal/62">
          Choose a difficulty and use Shuffle Maze whenever you want a different puzzle. Print one or more mazes on US Letter or A4, and include an answer key when you want the solution path on a second page.
        </p>
        <h3 className="mt-8 text-lg font-bold text-chocolate">Difficulty levels</h3>
        <ul className="mt-3 space-y-2 text-sm leading-7 text-charcoal/62">
          <li><strong className="font-semibold text-chocolate">Preschool (ages 3–4)</strong> — a small 8×8 grid with wide, clear paths and just a few choices, perfect for little hands learning to trace.</li>
          <li><strong className="font-semibold text-chocolate">Kindergarten (ages 5–6)</strong> — a 12×12 grid with more turns and branches to keep things interesting.</li>
          <li><strong className="font-semibold text-chocolate">Elementary (ages 7+)</strong> — an 18×18 grid with plenty of decision points and dead ends for a real challenge.</li>
        </ul>
        <p className="mt-6 text-sm leading-7 text-charcoal/62">
          Mazes are a screen-free way to build focus, problem-solving, and fine-motor skills. They work great for quiet time at home, early-finisher activities in the classroom, or travel busy bags.
          {isStaticToolPageActive("sudoku-generator") ? <> Looking for more? Try our <Link href="/tools/sudoku-generator" className="font-semibold text-brand-hover hover:underline">Sudoku generator</Link>.</> : null}
        </p>
      </div>
    </section>
  </main>;
}
