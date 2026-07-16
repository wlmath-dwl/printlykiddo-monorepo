import { redirect } from "next/navigation";

type SecondCategoryEditPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function SecondCategoryEditPage({
  params,
}: SecondCategoryEditPageProps) {
  const { id } = await params;
  redirect(`/admin/categories/${id}`);
}
