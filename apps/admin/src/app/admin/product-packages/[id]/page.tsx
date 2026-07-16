import { notFound } from "next/navigation";

import { ProductPackageFormPage } from "@/components/admin/product-package-form-page";
import { getProductPackageById, listCategories } from "@/lib/admin-db";

type ProductPackageEditPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ProductPackageEditPage({ params }: ProductPackageEditPageProps) {
  const { id } = await params;
  const packageId = Number(id);

  if (!Number.isInteger(packageId) || packageId <= 0) {
    notFound();
  }

  const [productPackage, { flat }] = await Promise.all([
    getProductPackageById(packageId),
    listCategories(),
  ]);

  if (!productPackage) {
    notFound();
  }

  return <ProductPackageFormPage categories={flat} initialPackage={productPackage} />;
}
