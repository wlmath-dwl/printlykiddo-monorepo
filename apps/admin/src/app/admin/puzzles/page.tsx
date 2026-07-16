import { PuzzleCategoryList } from "@/components/admin/puzzle-category-manager";
import { getPuzzleCategory, listPuzzleCategories } from "@/lib/puzzle-local-db";

export default function PuzzleAdminPage() {
  return <PuzzleCategoryList title="益智类管理" current={getPuzzleCategory("puzzles")!} items={listPuzzleCategories("puzzles")} />;
}
