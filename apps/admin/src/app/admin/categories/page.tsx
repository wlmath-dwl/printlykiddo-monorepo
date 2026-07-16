import { CategoryManager } from "@/components/admin/category-manager";
import { getCategorySummary, listCategories } from "@/lib/admin-db";

export default async function CategoriesPage() {
  const [{ flat }, summary] = await Promise.all([listCategories(), getCategorySummary()]);

  return <CategoryManager initialFlat={flat} initialSummary={summary} currentParentId={null} />;
}
