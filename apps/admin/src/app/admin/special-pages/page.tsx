import { SpecialPageManager } from "@/components/admin/special-page-manager";
import { listSpecialPages } from "@/lib/admin-db";

export default async function SpecialPagesPage() {
  const { items } = await listSpecialPages();
  return <SpecialPageManager initialItems={items} />;
}
