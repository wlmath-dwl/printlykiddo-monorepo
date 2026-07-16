import { notFound } from "next/navigation";

import { MazeGeneratorPage } from "@/components/admin/maze-generator-page";
import { getPuzzleCategory } from "@/lib/puzzle-local-db";
import { getPuzzlePageConfig } from "@/lib/puzzle-page-config";

export default async function MazePuzzleAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const config = getPuzzlePageConfig(slug);
  if (!config || config.family !== "mazes") notFound();
  return <MazeGeneratorPage fixedShape={config.variant} managedPageSlug={config.slug} managedCategory={getPuzzleCategory(config.slug) ?? undefined} />;
}
