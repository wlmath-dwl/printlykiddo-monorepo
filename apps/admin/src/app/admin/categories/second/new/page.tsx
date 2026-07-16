import { redirect } from "next/navigation";

export default function SecondCategoryCreatePage() {
  redirect("/admin/categories/new");
}
