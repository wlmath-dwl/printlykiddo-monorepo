import { HomepageConfigForm } from "@/components/admin/homepage-config-form";
import { getHomepageConfig } from "@/lib/admin-db";

export default async function HomepageConfigPage() {
  const config = await getHomepageConfig();
  return <HomepageConfigForm initialConfig={config} />;
}
