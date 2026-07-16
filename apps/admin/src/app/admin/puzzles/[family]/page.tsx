import { notFound } from "next/navigation";

import { PuzzleCategoryList } from "@/components/admin/puzzle-category-manager";
import { getPuzzleCategory, listPuzzleCategories } from "@/lib/puzzle-local-db";

export default async function PuzzleFamilyAdminPage({ params }: { params: Promise<{ family: string }> }) {
  const { family } = await params;
  const current = getPuzzleCategory(family);
  if (!current || current.parent_slug !== "puzzles") notFound();
  return <PuzzleCategoryList title={`${current.title} 三级页面`} current={current} items={listPuzzleCategories(family)} family={family} />;
}
