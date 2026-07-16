import snapshot from "@/data/tool-pages.json";

export type StaticToolPage = {
  slug: string;
  title: string;
  page_path: string;
  is_active: number;
  sort_order: number;
  updated_at: string;
};

const snapshotData = snapshot as { version?: number; tools?: StaticToolPage[] };
const tools = snapshotData.tools ?? [];

export function getStaticToolPages() {
  return [...tools].sort((a, b) => a.sort_order - b.sort_order);
}

export function getActiveStaticToolPages() {
  return getStaticToolPages().filter((tool) => tool.is_active !== 0);
}

export function isStaticToolPageActive(slug: string) {
  return tools.find((tool) => tool.slug === slug)?.is_active !== 0;
}
