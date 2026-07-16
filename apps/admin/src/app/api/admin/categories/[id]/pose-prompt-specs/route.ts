import { NextResponse } from "next/server";

import { updateCategoryPosePromptSpecsLocal } from "@/lib/admin-db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      pose_prompt_specs?: string | null;
    };

    const item = await updateCategoryPosePromptSpecsLocal(
      Number(id),
      body.pose_prompt_specs ?? null,
    );

    return NextResponse.json(item);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "保存本地姿态信息失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
