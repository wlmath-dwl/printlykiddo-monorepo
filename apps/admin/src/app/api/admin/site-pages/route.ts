import { NextRequest, NextResponse } from "next/server";

import { getLocalPageRegistry, runLocalPublisher } from "@/lib/local-page-publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  try {
    return NextResponse.json(await getLocalPageRegistry({
      status: search.get("status") || undefined,
      pageType: search.get("page_type") || undefined,
      query: search.get("q") || undefined,
      limit: Number(search.get("limit") || 100),
      offset: Number(search.get("offset") || 0),
    }));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "读取本地 URL 清单失败。" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as {
      action?: "scan" | "build" | "publish-local" | "rebuild";
      scope?: string;
      limit?: number;
      origin?: string;
    };
    if (!body.action || !["scan", "build", "publish-local", "rebuild"].includes(body.action)) {
      return NextResponse.json({ error: "不支持的本地静态页操作。" }, { status: 400 });
    }
    if (body.action === "build") {
      const origin = new URL(body.origin || "http://localhost:3000");
      if (!["localhost", "127.0.0.1", "::1"].includes(origin.hostname)) {
        return NextResponse.json({ error: "构建器只允许访问本机站点。" }, { status: 400 });
      }
    }
    const result = await runLocalPublisher(body.action, body);
    return NextResponse.json({ ok: true, mode: "local-only", ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "本地静态页操作失败。" },
      { status: 500 },
    );
  }
}
