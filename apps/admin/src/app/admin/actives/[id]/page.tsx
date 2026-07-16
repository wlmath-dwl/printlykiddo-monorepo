import { notFound } from "next/navigation";

import { ActiveFormPage } from "@/components/admin/active-form-page";
import { getActiveById } from "@/lib/admin-db";

type ActiveEditPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function ActiveEditPage({ params }: ActiveEditPageProps) {
  const { id } = await params;
  const activeId = Number(id);

  if (!Number.isInteger(activeId) || activeId <= 0) {
    notFound();
  }

  const active = await getActiveById(activeId);

  if (!active) {
    notFound();
  }

  return (
    <ActiveFormPage
      activeId={activeId}
      initialValues={{
        name: active.name,
        slug: active.slug,
        description: active.description ?? "",
        sort_order: active.sort_order,
        colored_label: active.colored_label,
      }}
    />
  );
}
