import { ToolManager } from "@/components/admin/tool-manager";
import { listToolPages } from "@/lib/tool-local-db";

export default function ToolsAdminPage() {
  return <ToolManager tools={listToolPages()} />;
}
