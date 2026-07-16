import { NextResponse } from "next/server";

import { updateCategoryPublishToPinLocal } from "@/lib/admin-db";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PUT(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as {
      publish_to_pin?: boolean;
    };

    const item = await updateCategoryPublishToPinLocal(
      Number(id),
      body.publish_to_pin === true,
    );

    return NextResponse.json(item);
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新 Pin 状态失败。";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
