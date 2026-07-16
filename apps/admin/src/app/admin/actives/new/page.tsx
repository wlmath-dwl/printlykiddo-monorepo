import { ActiveFormPage } from "@/components/admin/active-form-page";

export default async function ActiveCreatePage() {
  return (
    <ActiveFormPage
      initialValues={{
        name: "",
        slug: "",
        description: "",
        sort_order: 0,
        colored_label: false,
      }}
    />
  );
}
