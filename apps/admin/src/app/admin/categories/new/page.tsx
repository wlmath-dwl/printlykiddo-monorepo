import { notFound } from "next/navigation";

import { CategoryFormPage } from "@/components/admin/category-form-page";
import { listCategories, listActives } from "@/lib/admin-db";

type CategoryCreatePageProps = {
  searchParams: Promise<{
    parentId?: string;
    returnTo?: string;
  }>;
};

function normalizeReturnTo(value?: string) {
  if (!value?.startsWith("/admin/categories")) {
    return "/admin/categories";
  }

  return value;
}

export default async function CategoryCreatePage({
  searchParams,
}: CategoryCreatePageProps) {
  const { flat } = await listCategories();
  const { items: activeItems } = await listActives();
  const activeNames = activeItems.map((a) => a.name);

  const { parentId, returnTo } = await searchParams;
  const parsedParentId = parentId ? Number(parentId) : null;
  const backHref = normalizeReturnTo(returnTo);

  if (parentId) {
    if (!Number.isInteger(parsedParentId ?? NaN) || (parsedParentId ?? 0) <= 0) {
      notFound();
    }
  }

  const parent =
    parsedParentId === null ? null : flat.find((item) => item.id === parsedParentId) ?? null;

  if (parent) {
    let depth = 1;
    let cursorId = parent.parent_id;

    while (cursorId !== null) {
      const ancestor = flat.find((item) => item.id === cursorId) ?? null;
      if (!ancestor) {
        break;
      }
      depth += 1;
      cursorId = ancestor.parent_id;
    }

    if (depth >= 3) {
      notFound();
    }
  }

  if (parsedParentId !== null && !parent) {
    notFound();
  }

  return (
    <CategoryFormPage
      initialFlat={flat}
      activeItems={activeItems}
      availableActives={activeNames}
      initialValues={{
        parent_id: parent?.id ?? null,
        name: "",
        slug: "",
        description: "",
        name_zh: "",
        pose_prompt_specs: null,
        cover_image: undefined,
        seo_image_url: undefined,
        sort_order: 0,
        is_active: true,
      }}
      backHref={backHref}
      lockParentSelection
    />
  );
}
