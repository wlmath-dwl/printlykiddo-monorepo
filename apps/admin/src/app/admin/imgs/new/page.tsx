import { ImgFormPage } from "@/components/admin/img-form-page";
import { getImgAdminFormData } from "@/lib/img-admin-form";

export default async function ImgCreatePage() {
  const formData = await getImgAdminFormData();

  return (
    <ImgFormPage
      categoryTree={formData.categoryTree}
      actives={formData.actives}
      initialValues={{
        category_id: null,
        active_id: null,
        title: "",
        slug: "",
        description: "",
        difficulty: null,
        sort_order: 0,
        is_active: true,
        image_url: "",
        image_url_card: "",
        local_file_path: null,
        local_file_path_card: null,
      }}
    />
  );
}
