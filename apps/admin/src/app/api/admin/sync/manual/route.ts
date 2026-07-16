import { NextResponse } from "next/server";

import { startManualSync } from "@/lib/cloudflare-sync";

export async function POST() {
  try {
    return NextResponse.json(await startManualSync());
  } catch (error) {
    const message = error instanceof Error ? error.message : "执行手动同步失败。";
    const status = message.includes("同步正在执行中") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
