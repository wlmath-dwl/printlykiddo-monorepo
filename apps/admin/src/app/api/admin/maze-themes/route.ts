import { NextResponse } from "next/server";

import { createMazeTheme, listMazeThemes } from "@/lib/maze-theme-storage";
import type { MazeThemeInput } from "@/lib/maze-theme-types";

export async function GET() {
  return NextResponse.json(await listMazeThemes());
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(await createMazeTheme((await request.json()) as MazeThemeInput));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建主题失败。" },
      { status: 400 },
    );
  }
}
