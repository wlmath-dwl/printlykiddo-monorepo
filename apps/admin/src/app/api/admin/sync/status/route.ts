import { NextResponse } from "next/server";

import { getSyncStatus } from "@/lib/cloudflare-sync";

export async function GET() {
  try {
    return NextResponse.json(await getSyncStatus());
  } catch (error) {
    const message = error instanceof Error ? error.message : "获取同步状态失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
