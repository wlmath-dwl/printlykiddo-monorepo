import { NextResponse } from "next/server";

import { queryLocalTablePage } from "@/lib/local-db-viewer";

type RouteContext = { params: Promise<{ table: string }> };

export async function GET(request: Request, context: RouteContext) {
  const { table } = await context.params;
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "50");

  try {
    const data = queryLocalTablePage(table, page, pageSize);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取表数据失败。";
    const status = message.includes("不支持的表名") || message.includes("非法表名") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
