import { notFound } from "next/navigation";

import { ImgFormPage } from "@/components/admin/img-form-page";
import { getImgById } from "@/lib/admin-db";
import { getImgAdminFormData } from "@/lib/img-admin-form";

type ImgEditPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ImgEditPage({ params }: ImgEditPageProps) {
  const { id } = await params;
  const imgId = Number(id);

  if (!Number.isInteger(imgId) || imgId <= 0) {
    notFound();
  }

  const [img, formData] = await Promise.all([getImgById(imgId), getImgAdminFormData()]);

  if (!img) {
    notFound();
  }

  return (
    <ImgFormPage
      imgId={imgId}
      categoryTree={formData.categoryTree}
      actives={formData.actives}
      initialValues={{
        category_id: img.category_id,
        active_id: img.active_id,
        title: img.title ?? "",
        slug: img.slug ?? "",
        description: img.description ?? "",
        difficulty: img.difficulty,
        sort_order: img.sort_order,
        is_active: img.is_active,
        image_url: img.image_url,
        image_url_card: img.image_url_card,
        local_file_path: img.local_file_path,
        local_file_path_card: img.local_file_path_card,
      }}
    />
  );
}
