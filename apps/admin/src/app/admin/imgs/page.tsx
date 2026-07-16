import { ImgManagerDynamic } from "@/components/admin/img-manager-dynamic";
import { listImgs } from "@/lib/admin-db";
import { getImgAdminFormData } from "@/lib/img-admin-form";

export default async function ImgsPage() {
  const [{ items }, formData] = await Promise.all([listImgs(), getImgAdminFormData()]);

  return (
    <ImgManagerDynamic
      initialItems={items}
      categoryTree={formData.categoryTree}
      actives={formData.actives}
    />
  );
}
