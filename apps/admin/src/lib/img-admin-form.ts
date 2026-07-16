import type { ActiveRecord, CategoryRecord, CategoryTreeNode } from "@/lib/admin-types";
import { listActives, listCategories } from "@/lib/admin-db";

export type ImgAdminFormData = {
  categories: CategoryRecord[];
  categoryTree: CategoryTreeNode[];
  actives: ActiveRecord[];
};

export async function getImgAdminFormData(): Promise<ImgAdminFormData> {
  const [categoryData, activeData] = await Promise.all([
    listCategories(),
    listActives(),
  ]);

  return {
    categories: categoryData.flat,
    categoryTree: categoryData.tree,
    actives: activeData.items,
  };
}
