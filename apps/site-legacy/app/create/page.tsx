import type { Metadata } from "next";
import Link from "next/link";

import { SiteHeader } from "@/components/site-header";
import { getHomeCategoryCards } from "@/lib/d1";
import { buildSiteNavItems } from "@/lib/site-nav";
import { isStaticToolPageActive } from "@/lib/tool-static-data";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Create Printable Activities for Kids | PrintlyKiddo",
  description: "Make personalized printable activities for kids with free, easy-to-use printable generators.",
  alternates: { canonical: "/create" },
};

const tools = [
  { title: "Word Search Generator", href: "/tools/word-search-generator", icon: "A↗Z", description: "Turn kid-friendly themes into printable word searches and answer keys.", ready: true, color: "bg-[#FDE7D8]" },
  { title: "Maze Generator", href: "/tools/maze-generator", icon: "⌘", description: "Create a unique, print-ready maze in seconds.", ready: true, color: "bg-[#FFF3CF]" },
  { title: "Sudoku Generator", href: "/tools/sudoku-generator", icon: "3×3", description: "Make kid-friendly Sudoku worksheets with matching answer keys.", ready: true, color: "bg-[#E8F4DD]" },
];

export default async function CreatePage() {
  const navItems = buildSiteNavItems(await getHomeCategoryCards());
  return <main>
    <SiteHeader items={navItems} activePath="/create" />
    <section className="mx-auto w-full max-w-[1100px] px-6 pb-20 pt-14 lg:px-10 lg:pt-20">
      <div className="max-w-2xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-hover">Printable makers</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-chocolate md:text-5xl">Create something just for them.</h1>
        <p className="mt-5 text-base leading-7 text-charcoal/65 md:text-lg">Make personalized activities for quiet time, home learning, or the classroom. Pick a tool, customize it, and print.</p>
      </div>
      <div className="mt-12 grid max-w-[1100px] gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {tools.filter((tool) => isStaticToolPageActive(tool.href.split("/").at(-1) ?? "")).map((tool) => tool.ready ? <Link key={tool.title} href={tool.href!} className="group flex min-h-48 flex-col rounded-2xl border border-[#E7E2D9] bg-white p-6 transition hover:-translate-y-1 hover:border-brand/55 hover:shadow-[0_16px_36px_rgba(61,53,34,0.08)]">
          <span className={`grid size-14 place-items-center rounded-2xl ${tool.color} text-lg font-black text-chocolate`}>{tool.icon}</span>
          <h2 className="mt-5 text-xl font-bold text-chocolate">{tool.title}</h2><p className="mt-2 text-sm leading-6 text-charcoal/60">{tool.description}</p>
          <span className="mt-auto pt-5 text-sm font-bold text-brand-hover">Start creating <span className="transition-transform group-hover:translate-x-1" aria-hidden>→</span></span>
        </Link> : <article key={tool.title} className="flex min-h-48 flex-col rounded-2xl border border-[#E7E2D9] bg-white/60 p-6">
          <div className="flex items-start justify-between"><span className={`grid size-14 place-items-center rounded-2xl ${tool.color} text-sm font-black text-chocolate/65`}>{tool.icon}</span><span className="rounded-full bg-[#F0EEE9] px-3 py-1 text-xs font-bold text-charcoal/45">Coming soon</span></div>
          <h2 className="mt-5 text-xl font-bold text-chocolate/65">{tool.title}</h2><p className="mt-2 text-sm leading-6 text-charcoal/45">{tool.description}</p>
        </article>)}
      </div>
    </section>
  </main>;
}
