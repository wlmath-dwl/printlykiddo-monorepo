import { NextResponse } from "next/server";

import { deletePoseSource, getPoseSourceById, updatePoseSource } from "@/lib/admin-db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  const { id } = await context.params;
  const item = await getPoseSourceById(Number(id));

  if (!item) {
    return NextResponse.json({ error: "姿态记录不存在。" }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      pose_title?: string | null;
      pose_title_zh?: string | null;
      source_kind?: "outline" | "color" | "scene_color";
      image_url?: string | null;
      local_file_path?: string | null;
    };

    const item = await updatePoseSource(Number(id), {
      pose_title: body.pose_title ?? null,
      pose_title_zh: body.pose_title_zh ?? null,
      source_kind:
        body.source_kind === "scene_color"
          ? "scene_color"
          : body.source_kind === "outline"
            ? "outline"
            : body.source_kind === "color"
              ? "color"
              : undefined,
      image_url: body.image_url ?? null,
      local_file_path: body.local_file_path ?? null,
    });

    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新姿态失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    await deletePoseSource(Number(id));
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除姿态失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
