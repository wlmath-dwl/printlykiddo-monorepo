import { ActiveManager } from "@/components/admin/active-manager";
import { listActives } from "@/lib/admin-db";

export default async function ActivesPage() {
  const { items } = await listActives();
  return <ActiveManager initialItems={items} />;
}
