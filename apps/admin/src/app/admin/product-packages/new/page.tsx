import { ProductPackageFormPage } from "@/components/admin/product-package-form-page";
import { listCategories } from "@/lib/admin-db";

export default async function NewProductPackagePage() {
  const { flat } = await listCategories();
  return <ProductPackageFormPage categories={flat} />;
}
