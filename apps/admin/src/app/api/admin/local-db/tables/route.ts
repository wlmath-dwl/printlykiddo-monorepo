import { NextResponse } from "next/server";

import { listLocalDbTablesForViewer } from "@/lib/local-db-viewer";

export async function GET() {
  try {
    return NextResponse.json({ tables: listLocalDbTablesForViewer() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取表列表失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
