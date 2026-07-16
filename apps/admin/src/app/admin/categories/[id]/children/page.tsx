import { notFound } from "next/navigation";

import { CategoryManager } from "@/components/admin/category-manager";
import { getCategorySummary, listCategories } from "@/lib/admin-db";

type CategoryChildrenPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function getCategoryDepth(
  categoryId: number,
  categoryMap: Map<number, { id: number; parent_id: number | null }>,
) {
  let depth = 1;
  let cursorId = categoryMap.get(categoryId)?.parent_id ?? null;

  while (cursorId !== null) {
    const parent = categoryMap.get(cursorId);
    if (!parent) {
      break;
    }
    depth += 1;
    cursorId = parent.parent_id;
  }

  return depth;
}

export default async function CategoryChildrenPage({
  params,
}: CategoryChildrenPageProps) {
  const { id } = await params;
  const categoryId = Number(id);

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    notFound();
  }

  const [{ flat }, summary] = await Promise.all([listCategories(), getCategorySummary()]);
  const categoryMap = new Map(flat.map((item) => [item.id, item]));
  const current = categoryMap.get(categoryId) ?? null;

  if (!current) {
    notFound();
  }

  if (getCategoryDepth(categoryId, categoryMap) >= 3) {
    notFound();
  }

  return <CategoryManager initialFlat={flat} initialSummary={summary} currentParentId={categoryId} />;
}
