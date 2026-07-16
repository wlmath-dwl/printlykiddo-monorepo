import type { SiteHeaderNavChild, SiteHeaderNavItem } from "@/components/site-header-nav";
import { isStaticToolPageActive } from "@/lib/tool-static-data";

type CategoryLike = {
  slug: string;
  title: string;
  coverImageUrl?: string | null;
  coverImageUrl512?: string | null;
  seoImageUrl?: string | null;
};

export function buildSiteNavItems(firstCategories: CategoryLike[]): SiteHeaderNavItem[] {
  const printableCategories = firstCategories;
  const toolChildren = ([
    { label: "Word Search", href: "/tools/word-search-generator", icon: "word-search" },
    { label: "Maze", href: "/tools/maze-generator", icon: "maze" },
    { label: "Sudoku", href: "/tools/sudoku-generator", icon: "sudoku" },
  ] satisfies SiteHeaderNavChild[]).filter((item) => isStaticToolPageActive(item.href.split("/").at(-1) ?? ""));

  return [
    {
      label: "Printables",
      href: "/#printable-categories",
      columns: 3,
      children: printableCategories.map((category) => ({
        label: category.title,
        href: `/${category.slug}`,
        imageUrl: category.coverImageUrl ?? category.coverImageUrl512 ?? category.seoImageUrl,
      })),
    },
    {
      label: "Tools",
      href: "/create",
      columns: 2,
      children: toolChildren,
    },
  ];
}
