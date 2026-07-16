import { PinPublishManager } from "@/components/admin/pin-publish-manager";
import { listPinPublishCycles } from "@/lib/admin-db";

export default async function PinPublishPage() {
  const { items } = await listPinPublishCycles();
  return <PinPublishManager initialItems={items} />;
}
