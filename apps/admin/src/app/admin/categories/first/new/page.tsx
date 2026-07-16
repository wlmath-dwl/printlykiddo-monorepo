import { redirect } from "next/navigation";

export default function FirstCategoryCreatePage() {
  redirect("/admin/categories/new");
}
