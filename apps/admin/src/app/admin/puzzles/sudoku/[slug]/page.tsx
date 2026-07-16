import { notFound } from "next/navigation";

import { SudokuGeneratorPage } from "@/components/admin/sudoku-generator-page";
import { getPuzzleCategory } from "@/lib/puzzle-local-db";
import { getPuzzlePageConfig } from "@/lib/puzzle-page-config";

export default async function SudokuPuzzleAdminPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const config = getPuzzlePageConfig(slug);
  if (!config || config.family !== "sudoku") notFound();
  return <SudokuGeneratorPage fixedKind={config.variant} managedPageSlug={config.slug} managedCategory={getPuzzleCategory(config.slug) ?? undefined} />;
}
