import { BacklinkExchangeManager } from "@/components/admin/backlink-exchange-manager";
import { listBacklinkExchanges } from "@/lib/admin-db";

export default async function BacklinkExchangesPage() {
  const { items } = await listBacklinkExchanges();
  return <BacklinkExchangeManager initialItems={items} />;
}
