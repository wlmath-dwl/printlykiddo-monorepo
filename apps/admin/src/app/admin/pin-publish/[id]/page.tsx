import { notFound } from "next/navigation";

import { PinPublishCyclePage } from "@/components/admin/pin-publish-cycle-page";
import {
  getPinPublishCycle,
  listPinPublishCycleCategories,
  listPinPublishScheduleItems,
} from "@/lib/admin-db";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PinPublishCycleEditPage({ params }: PageProps) {
  const { id } = await params;
  const cycleId = Number(id);
  if (!Number.isInteger(cycleId) || cycleId <= 0) {
    notFound();
  }

  const cycle = await getPinPublishCycle(cycleId);
  if (!cycle) {
    notFound();
  }

  const [categories, items] = await Promise.all([
    listPinPublishCycleCategories(cycleId),
    listPinPublishScheduleItems(cycleId),
  ]);

  return (
    <PinPublishCyclePage
      cycle={cycle}
      initialCategories={categories.items}
      initialItems={items.items}
    />
  );
}
