import { NextResponse } from "next/server";

import { purgeOnlineIsrCache } from "@/lib/cloudflare-sync";

export async function POST() {
  try {
    return NextResponse.json(await purgeOnlineIsrCache());
  } catch (error) {
    const message = error instanceof Error ? error.message : "清空 ISR 缓存失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
