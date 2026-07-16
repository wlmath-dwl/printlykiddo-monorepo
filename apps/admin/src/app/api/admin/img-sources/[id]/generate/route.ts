import { NextResponse } from "next/server";

import { generateImgsFromSource } from "@/lib/img-generation-workflow";
import type { ImgGeneratedVariant, ImgSourceKind } from "@/lib/img-source-generation";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const sourceId = Number(id);

    if (!Number.isInteger(sourceId) || sourceId <= 0) {
      return NextResponse.json({ error: "原始图 id 无效。" }, { status: 400 });
    }

    const body = (await request.json()) as {
      source_kind?: ImgSourceKind;
      variants?: ImgGeneratedVariant[];
      replace_existing?: boolean;
    };
    const result = await generateImgsFromSource({
      sourceId,
      sourceKind: body.source_kind,
      variants: body.variants,
      replaceExisting: body.replace_existing,
    });

    return NextResponse.json({
      items: result.items,
      generated_count: result.generated_count,
      drafted_count: result.drafted_count ?? 0,
      deleted_count: result.deleted_count,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "从原始图生成图片失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
