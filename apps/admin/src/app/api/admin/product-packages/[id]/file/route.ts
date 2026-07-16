import { NextResponse } from "next/server";

import { readProductPackagePdfFile } from "@/lib/product-package-pdf";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const { searchParams } = new URL(request.url);
    const kind = searchParams.get("kind") === "preview" ? "preview" : "pdf";
    const download = searchParams.get("download") === "1";
    const file = await readProductPackagePdfFile(Number(id), kind);

    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取产品包 PDF 失败。";
    return NextResponse.json({ error: message }, { status: 404 });
  }
}
