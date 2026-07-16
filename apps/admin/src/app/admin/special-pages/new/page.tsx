import { SpecialPageFormPage } from "@/components/admin/special-page-form-page";
import { listCategories } from "@/lib/admin-db";

const defaultContentJson = JSON.stringify({ items: [] }, null, 2);

export default async function NewSpecialPagePage() {
  const { tree } = await listCategories();

  return (
    <SpecialPageFormPage
      categoryTree={tree}
      initialValues={{
        title: "",
        slug: "",
        subtitle: "",
        description: "",
        seo_title: "",
        seo_description: "",
        hero_image_url: "",
        card_image_url: "",
        theme_color: "#7ADDE8",
        status: "draft",
        sort_order: 0,
        content_json: defaultContentJson,
      }}
    />
  );
}
