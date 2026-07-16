import { SiteHeader } from "@/components/site-header";
import { getFirstCategories } from "@/lib/d1";
import { buildSiteNavItems } from "@/lib/site-nav";

type StaticInfoPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  paragraphs?: string[];
  sections?: Array<{
    title: string;
    body: string;
  }>;
};

export async function StaticInfoPage({
  eyebrow,
  title,
  description,
  paragraphs = [],
  sections = [],
}: StaticInfoPageProps) {
  const navItems = buildSiteNavItems(await getFirstCategories());

  return (
    <main>
      <section className="w-full">
        <SiteHeader items={navItems} subtle />
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-20 pt-10 lg:px-10">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-chocolate/45">
          {eyebrow}
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-bold tracking-tight text-chocolate md:text-5xl">
          {title}
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-8 text-charcoal/70 md:text-lg">
          {description}
        </p>

        {paragraphs.length > 0 ? (
          <div className="mt-10 max-w-4xl space-y-5 text-base leading-8 text-charcoal/72 md:text-lg">
            {paragraphs.map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        ) : null}

        {sections.length > 0 ? (
          <div className="mt-12 grid max-w-4xl gap-7">
            {sections.map((section) => (
              <section
                key={section.title}
                className="border-l-4 border-chocolate/20 pl-5"
              >
                <h2 className="text-xl font-bold leading-7 text-chocolate md:text-2xl">
                  {section.title}
                </h2>
                <p className="mt-3 text-base leading-8 text-charcoal/72 md:text-lg">
                  {section.body}
                </p>
              </section>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
