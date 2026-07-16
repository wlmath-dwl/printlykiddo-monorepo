import { redirect } from "next/navigation";

type FirstCategoryEditPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function FirstCategoryEditPage({
  params,
}: FirstCategoryEditPageProps) {
  const { id } = await params;
  redirect(`/admin/categories/${id}`);
}
