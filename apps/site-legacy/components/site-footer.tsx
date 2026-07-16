import Link from "next/link";

import { getFirstCategories } from "@/lib/d1";
import { SITE_BRAND_NAME, SITE_DOMAIN_LABEL } from "@/lib/site-seo";

export async function SiteFooter() {
  const categories = await getFirstCategories(12);
  const siteLinks = [
    { label: "About", href: "/about" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ];

  return (
    <footer className="border-t border-chocolate/10 bg-cream print:hidden">
      <div className="mx-auto max-w-6xl px-6 py-14 lg:px-10">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)_minmax(0,1fr)] md:gap-14">
          <div>
            <p className="text-base font-bold text-chocolate">{SITE_BRAND_NAME}</p>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-charcoal/75">
              PrintlyKiddo is a printable resource website for parents and teachers
              who choose, download, and print learning materials for children. Browse
              by topic and find practical PDFs for home and classroom use.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-chocolate/45">
              Site
            </p>
            <ul className="mt-4 flex flex-col gap-2 text-sm">
              {siteLinks.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-charcoal/80 transition hover:text-chocolate hover:underline"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-chocolate/45">
              Categories
            </p>
            <ul className="mt-4 flex flex-col gap-2 text-sm">
              {categories.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/${c.slug}`}
                    className="text-charcoal/80 transition hover:text-chocolate hover:underline"
                  >
                    {c.title} printables
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-chocolate/10 pt-8 text-sm text-charcoal/55 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {SITE_BRAND_NAME} · {SITE_DOMAIN_LABEL}
          </p>
          <p className="text-charcoal/50">Printable resources and activity pages for home and classroom use.</p>
        </div>
      </div>
    </footer>
  );
}
