import { notFound } from "next/navigation";

import { LocalDataTableViewer } from "@/components/admin/local-data-table-viewer";
import { LOCAL_DB_VIEW_TABLES, type LocalDbViewTableName } from "@/lib/local-db-viewer-tables";

type PageProps = {
  params: Promise<{ table: string }>;
};

export default async function LocalDataTablePage({ params }: PageProps) {
  const { table } = await params;
  const allowed = LOCAL_DB_VIEW_TABLES.some((t) => t.name === table);
  if (!allowed) {
    notFound();
  }

  return <LocalDataTableViewer table={table as LocalDbViewTableName} />;
}
