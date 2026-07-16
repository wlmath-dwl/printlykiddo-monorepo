import { notFound } from "next/navigation";

import { VideoCycleEditor } from "@/components/admin/video-cycle-editor";
import { getVideoPublishCycle, listGeneratedVideos } from "@/lib/admin-db";

type VideoCycleEditPageProps = {
  params: Promise<{ id: string }>;
};

export default async function VideoCycleEditPage({ params }: VideoCycleEditPageProps) {
  const { id } = await params;
  const cycleId = Number(id);
  if (!Number.isFinite(cycleId)) {
    notFound();
  }

  const cycle = await getVideoPublishCycle(cycleId);
  if (!cycle) {
    notFound();
  }

  const { items } = await listGeneratedVideos(cycle.id);
  return <VideoCycleEditor cycle={cycle} initialVideos={items} />;
}
