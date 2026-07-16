import { notFound } from "next/navigation";

import { SpecialPageFormPage } from "@/components/admin/special-page-form-page";
import { getSpecialPageById, listCategories } from "@/lib/admin-db";

type SpecialPageEditPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function SpecialPageEditPage({ params }: SpecialPageEditPageProps) {
  const { id } = await params;
  const specialPageId = Number(id);

  if (!Number.isInteger(specialPageId) || specialPageId <= 0) {
    notFound();
  }

  const [specialPage, categories] = await Promise.all([
    getSpecialPageById(specialPageId),
    listCategories(),
  ]);

  if (!specialPage) {
    notFound();
  }

  return (
    <SpecialPageFormPage
      specialPageId={specialPage.id}
      categoryTree={categories.tree}
      initialValues={{
        title: specialPage.title,
        slug: specialPage.slug,
        subtitle: specialPage.subtitle ?? "",
        description: specialPage.description ?? "",
        seo_title: specialPage.seo_title ?? "",
        seo_description: specialPage.seo_description ?? "",
        hero_image_url: specialPage.hero_image_url ?? "",
        card_image_url: specialPage.card_image_url ?? "",
        theme_color: specialPage.theme_color || "#7ADDE8",
        status: specialPage.status,
        sort_order: specialPage.sort_order,
        content_json: specialPage.content_json,
      }}
    />
  );
}
