import { NextResponse } from "next/server";

import { deleteMazeTheme, updateMazeTheme } from "@/lib/maze-theme-storage";
import type { MazeThemeInput } from "@/lib/maze-theme-types";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await updateMazeTheme(id, (await request.json()) as MazeThemeInput));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "更新主题失败。" },
      { status: 400 },
    );
  }
}

export async function DELETE(_: Request, context: Context) {
  try {
    const { id } = await context.params;
    await deleteMazeTheme(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "删除主题失败。" },
      { status: 400 },
    );
  }
}
