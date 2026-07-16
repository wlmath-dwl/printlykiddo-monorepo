import { VideoCycleManager } from "@/components/admin/video-cycle-manager";
import { listVideoPublishCycles } from "@/lib/admin-db";

export default async function VideoCyclesPage() {
  const { items } = await listVideoPublishCycles();
  return <VideoCycleManager initialItems={items} />;
}
