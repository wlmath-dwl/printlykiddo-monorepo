import { notFound } from "next/navigation";

import { CategoryFormPage } from "@/components/admin/category-form-page";
import { listCategories, listActives } from "@/lib/admin-db";
import type { CategoryRecord } from "@/lib/admin-types";

type CategoryEditPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams: Promise<{
    returnTo?: string;
  }>;
};

function normalizeReturnTo(value?: string, fallback = "/admin/categories") {
  if (!value?.startsWith("/admin/categories")) {
    return fallback;
  }

  return value;
}

export default async function CategoryEditPage({
  params,
  searchParams,
}: CategoryEditPageProps) {
  const { id } = await params;
  const categoryId = Number(id);

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    notFound();
  }

  const { flat } = await listCategories();
  const { items: activeItems } = await listActives();
  const activeNames = activeItems.map((a) => a.name);

  const current = flat.find((item: CategoryRecord) => item.id === categoryId);
  const { returnTo } = await searchParams;

  if (!current) {
    notFound();
  }

  const fallbackBackHref =
    current.parent_id === null
      ? "/admin/categories"
      : `/admin/categories/${current.parent_id}/children`;
  const backHref = normalizeReturnTo(returnTo, fallbackBackHref);

  return (
    <CategoryFormPage
      categoryId={categoryId}
      initialFlat={flat}
      activeItems={activeItems}
      availableActives={activeNames}
      backHref={backHref}
      initialValues={{
        parent_id: current.parent_id,
        name: current.name,
        slug: current.slug,
        description: current.description ?? "",
        name_zh: current.name_zh ?? "",
        pose_prompt_specs: current.pose_prompt_specs,
        cover_image: current.cover_image ?? undefined,
        seo_image_url: current.seo_image_url ?? undefined,
        sort_order: current.sort_order,
        is_active: current.is_active,
        publish_to_pin: current.publish_to_pin,
      }}
    />
  );
}
