import { redirect } from "next/navigation";

import { LOCAL_DB_VIEW_TABLES } from "@/lib/local-db-viewer-tables";

export default function LocalDataIndexPage() {
  redirect(`/admin/local-data/${LOCAL_DB_VIEW_TABLES[0].name}`);
}
