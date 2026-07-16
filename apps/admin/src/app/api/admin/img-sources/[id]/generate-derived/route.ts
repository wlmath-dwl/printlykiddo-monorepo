import { NextResponse } from "next/server";

import { generateDerivedSourcesForColorSource } from "@/lib/img-source-derived-generation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const sourceId = Number(id);

    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      return NextResponse.json({ error: "原始图 id 无效。" }, { status: 400 });
    }

    return NextResponse.json(await generateDerivedSourcesForColorSource({ sourceId }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成背景图和线框图失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
