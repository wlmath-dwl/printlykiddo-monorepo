import { ProductPackageManager } from "@/components/admin/product-package-manager";
import { listProductPackages } from "@/lib/admin-db";

export default async function ProductPackagesPage() {
  const { items } = await listProductPackages();
  return <ProductPackageManager initialItems={items} />;
}
